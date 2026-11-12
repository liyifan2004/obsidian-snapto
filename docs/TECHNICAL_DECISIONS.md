# Technical decisions

Decisions that shaped the code and would be expensive to reverse quietly.

---

## 0001. Wrap two prototypes instead of adding a global key listener

**Date:** 2026-11-13 · **Status:** accepted

### Context

SnapTo needs to know when a suggestion list opens, what it contains, and which keymap scope owns it. Obsidian exposes none of this publicly. The obvious alternative — a `window` capture listener plus DOM queries — cannot bind number keys with the right priority, because Obsidian's own keymap runs on `window` capture and consumes matching keys first.

### Decision

Replace `SuggestModal.prototype.open` and `PopoverSuggest.prototype.open` with a wrapper that calls the original, then reads the instance.

### Rationale

- The instance carries `chooser`, `scope`, `resultContainerEl`: everything needed, with zero DOM guessing.
- Registering on the instance's own `scope` gives the correct lifetime for free — Obsidian pushes and pops it. There is no stack of our own to keep in sync.
- The patch is narrow: assignment creates an own property on the *subclass* prototype, so other `Modal` users are untouched, and `delete` restores the prototype chain exactly.

### Consequences

- Monkey-patching is the kind of thing reviewers dislike. It is therefore the only such place in the plugin, it is isolated in `HostPatcher`, it never changes arguments or return values, and it swallows its own errors.
- Coexistence with Quick Select (which patches the same methods) works: both wrappers chain. If Quick Select unloads first, our restore writes its wrapper back — harmless, since we unload too.

---

## 0002. Bind keys to the host's scope, not to our own

**Date:** 2026-11-13 · **Status:** accepted

### Context

Alternative A: `app.keymap.pushScope(ourScope)` when a list appears. Alternative B: register on the scope that already belongs to the list.

### Decision

B.

### Rationale

A requires knowing exactly when to `popScope`. Get that wrong once — modal closed via a path we did not observe — and `Ctrl+1` keeps hijacking the app after the search is gone. B has no such failure mode: when the host pops its scope, our handlers stop existing.

### Consequences

- Requires the internal `scope` field (see [API_COMPATIBILITY.md](API_COMPATIBILITY.md)).
- Handlers must be unregistered manually on unload, since we keep references for `scope.unregister`.

---

## 0003. Read text from the DOM, act through the API

**Date:** 2026-11-13 · **Status:** accepted

### Context

Candidates can be described either by their raw values (`TFile`, `Command`, `{match,item}`) or by the rendered row. Acting can go through `useSelectedItem()` or by dispatching a click.

### Decision

Reading prefers `.suggestion-title` from the row; acting prefers `useSelectedItem()`, with a click dispatch as fallback.

### Rationale

- What the user sees is the row. A query that matches the visible title but not the internal value feels broken ("I typed what I see").
- `useSelectedItem()` is exactly what Enter does, so plugins that special-case their own confirmation keep working.
- The click fallback keeps third-party lists working when they build their own list object without `useSelectedItem`.

### Consequences

- Reading depends on `.suggestion-title` existing; `textContent` is the fallback, and the raw value is the fallback after that.
- Row/value alignment must be computed carefully. Groups (`mod-group`) and decoration rows are handled explicitly and covered by tests.

---

## 0004. Auto confirm requires an exact or normalized match

**Date:** 2026-11-13 · **Status:** accepted

### Context

"Auto match" can mean three different things: move the highlight, open the item, or run a command. Only the first is free of consequences.

### Decision

Default action is *highlight only*. Confirmation is opt-in **and** additionally gated: it only fires for `exact` or `normalized` matches, regardless of the configured minimum match level.

### Rationale

Typing `note` while intending `notebook.md` is normal. A prefix hit means "one of these probably answers you"; auto-opening it is a wrong-file action, not a small mistake. `normalized` (case, width, spaces ignored) still means "this is the name you typed".

### Consequences

- Users who want aggressive behaviour cannot get it. That is intentional; the setting exists, but the safety gate does not.
- Verified at runtime: with confirm enabled, `Meeting` (prefix) only highlights; `Meeting Notes` (exact) opens.

---

## 0005. Do nothing when several candidates tie

**Date:** 2026-11-13 · **Status:** accepted

### Decision

Default conflict policy is `unique`: act only when exactly one candidate holds the strongest match level.

### Rationale

Two files with the same name in different folders is a normal vault. Picking one at random is worse than doing nothing, because the user cannot tell why the wrong file opened.

### Consequences

- `first` / `last` / `none` are available for users who prefer determinism.
- Tested both ways: `unique` leaves the highlight alone on a four-way tie; `last` moves it to the last tied row.

---

## 0006. Default minimum match level is `contains`

**Date:** 2026-11-13 · **Status:** accepted

### Context

The first build defaulted to `prefix`, which looked safe. Runtime testing showed the consequence: typing `纪要` never matched `会议纪要 2026`, because Chinese has no word boundary a prefix could latch onto.

### Decision

Default to `contains`.

### Rationale

- Highlighting is cheap and reversible; the strict gate already lives in the confirm path (decision 0004).
- A single Latin character now matches many rows, which is exactly why the default conflict policy is `unique` — the two defaults cover each other.

### Consequences

- Users who dislike broad matching can raise the floor to `prefix` or `exact` in settings.

---

## 0007. No setting for "close the search after confirming"

**Date:** 2026-11-13 · **Status:** accepted

### Context

The brief asked for this toggle. Implementing it would mean preventing the host from closing its own modal — `SuggestModal.selectSuggestion()` calls `close()` itself, and the modal's lifecycle is not ours to hold open.

### Decision

Do not ship the toggle.

### Rationale

A switch that cannot change behaviour is worse than no switch: it teaches users that settings are decorative. The user-facing description of auto confirm states the actual behaviour instead.

### Consequences

- Third-party surfaces that keep their popover open stay open; modal-based ones close. This is native behaviour, not a SnapTo choice.

---

## 0008. Rejected: supporting the global search panel in v1

**Date:** 2026-11-13 · **Status:** refined by 0012

### Context

The search view lists `.search-result` blocks. There is no selection model: nothing is "the current row", and no API selects one.

### Decision

Out of scope for the first release. Recorded in [FEATURE_MATRIX.md](FEATURE_MATRIX.md) as level D.

### Rationale

Supporting it means inventing a highlight layer and deciding whether choosing a result should close the panel — a different feature with its own interaction design, not an adapter. Shipping a half-version would make "SnapTo works everywhere" false in the one place users would notice.

### Consequences

- Revisit when the selection model exists, or build a deliberate navigation mode with its own settings.

---

## 0009. One context per host instance

**Date:** 2026-11-13 · **Status:** accepted

### Context

`PopoverSuggest.open()` runs on every keystroke. It returns early when the popover is already open, but our wrapper runs regardless, and contexts were keyed by a serial id that could never match an existing one.

Measured consequence: typing four characters produced four contexts, 36 keymap handlers, four observers and four concurrent auto-match timers. With auto confirm enabled, that is four chances to submit the same choice.

### Decision

Carry the host instance on the context and look it up before attaching. Repeat opens reuse the existing context: touch it, re-sync shortcuts, refresh badges.

### Rationale

The alternative — a `WeakMap` keyed by host — would work equally well, but the context already has to know which instance it came from, and putting the reference on it keeps the lookup logic in one place with the data.

### Consequences

- Depends on reference equality. A host that constructs a new instance per open would still produce one context per open; that is correct behaviour, not a bug, so the dedupe silently does nothing rather than misfiring.
- `SurfaceBinder` exists so the rule can be tested without instantiating a `Plugin`.

---

## 0010. Desktop only

**Date:** 2026-11-13 · **Status:** accepted

### Context

`isDesktopOnly` was `false`, which is a promise that the plugin is usable on touch. The distinctive feature is "hold a modifier, press a digit". There is no modifier on a phone and no keyboard.

### Decision

`isDesktopOnly: true`.

### Rationale

Badges alone are not a feature; keeping the plugin mobile-installable would offer phone users a plugin whose main path cannot be reached, and would invite review questions about touch target sizes for UI that only exists to support keyboard use.

### Consequences

- Mobile is out of scope rather than "untested". Nothing in the code is desktop-specific, so this could be revisited if a touch gesture were designed.

---

## 0011. Highlighting carries no extra gate

**Date:** 2026-11-13 · **Status:** accepted

### Context

Decision 0006 set the default minimum match level to `contains` so Chinese titles can be reached. A later proposal was to require a stronger level before moving the highlight, on the grounds that loose matching is noisy.

### Decision

No. The configured minimum applies to highlighting as-is; the strict gate stays in the confirm path only (decision 0004).

### Rationale

Two independent gates on the same action make the setting meaningless: a user who lowers the level would see nothing change. Highlighting is reversible and visible, and the tie policy (`unique` by default) already prevents the worst noise — moving between equally good candidates. Adding a second gate would also break the Chinese case that motivated 0006: `纪要` against `会议纪要 2026` is a `contains` hit, and gating highlighting on `prefix` would hide exactly the improvement.

### Consequences

- Typing a single Latin letter highlights broadly. Mitigated by `unique` doing nothing on ties, and by the confirmation gate.
- Users who want less movement raise the level themselves.

---

## 0012. Global search panel: 0.2 candidate, not v1

**Date:** 2026-11-13 · **Status:** accepted, refines 0008

### Context

0008 rejected the search panel for v1. Reviewing the 0.2 scope, it is worth stating what would have to be true before it becomes worth doing.

### Decision

Keep it out of 0.1.x. Treat it as the first candidate for 0.2 only if a *navigation* mode is acceptable — not a selection mode.

### Rationale

- The panel has no selection model, so "select the Nth result" has no native meaning. Any implementation invents one, which means owning highlight rendering, scrolling and escape behaviour.
- "Confirm" there means opening a file, which is a side effect. Do 0004's confidence gate and the tie policy still make sense? They would have to be re-derived, not copied.
- Estimate: roughly half the work already in 0.1.x, with a worse compatibility story (`.search-result` markup is not a documented contract the way `.suggestion-item` is).

### Consequences

- 0.2 starts with a design note, not an adapter. If the design says "selection", the answer is no and the reason is written down here.
- Until then, the README says what works instead of implying completeness.

---

## 0013. One reconcile instead of three branches

**Date:** 2026-11-13 · **Status:** accepted

### Context

0.1.1 shipped three places that each maintained part of a surface's state: `onAttach` (shortcuts + watcher + badges), `onReuse` (shortcuts + badges), `onSettingsChanged` (either sync, or dispose + unwatch + clear). Turning a scene off worked until the next keystroke, when the reuse branch re-registered everything from `quickSelectEnabled` alone. Turning it back on never rebuilt the watcher, because nothing on the settings path called `watch`.

### Decision

One `reconcile(context)` derives all three states from current settings and is the only writer. Every path calls it: first attach, repeat open, settings change, external sync. Scene membership is decided inside `syncContext` and `refreshBadges`, not at the call sites.

### Rationale

The three-branch version was not wrong in any single branch; it was wrong in the space between them. Any fix that adds a fourth branch ("remember to re-watch") reproduces the same failure with a different trigger. Making each effect idempotent and re-deriving from settings removes the class of bug rather than one instance.

### Consequences

- A disabled scene keeps a live context and a live observer that does nothing. Accepted: the alternative (removing the context) makes the surface unrevivable until reopened, and a modal does not reopen on its own.
- `SurfaceBinder` lost its scene knowledge entirely and became "one context per host instance, nothing else". `isSceneEnabled` has exactly one definition, in `main.ts`.
- The cost is visible: 10 orchestration tests exist because this logic has no other place to be verified.

---

## 0014. HostPatcher leaves an inert layer after a reload

**Date:** 2026-11-13 · **Status:** accepted

### Context

When another plugin wraps `SuggestModal.prototype.open` after us, unloading must not delete their layer. The chosen fix keeps our wrapper in the chain with a "not active" flag, which means each plugin reload can leave one extra pass-through function behind.

### Decision

Leave it. Do not add detection or cleanup for a no-op frame.

### Rationale

The alternative is tracking "am I still the outermost wrapper" across reloads, which needs a registry of wrappers and a way to tell ours from theirs — machinery whose failure mode is deleting someone else's code, the very bug 0.1.1 fixed. A function that calls through and returns is the cheapest possible residue.

### Consequences

- After several reloads in a session, a keystroke may pass through two or three inert frames. Measured cost: a function call.
- Anyone reading the prototype chain later should know this is deliberate; hence this record.

---

## 0015. Runtime checks get a negative control

**Date:** 2026-11-13 · **Status:** accepted

### Context

A runtime assertion that passes proves nothing on its own: it may be looking at the wrong surface, or at a state the bug cannot reach. The dedupe assertion shipped in 0.1.1 was exactly that — it re-typed into the quick switcher, which never calls `open()` twice, so it passed on 0.1.0 as well.

### Decision

Every runtime assertion that claims to catch a specific historical bug is run once against the build that had the bug. The old sources are exported with `git archive <sha> src` into a scratch directory, built there, and swapped into a throwaway vault. The current working tree is never touched.

### Rationale

`git checkout` would work and is what was used the first time, but it is forbidden by the shared-repository rules this machine follows, and it edits files another process may be holding. `git archive` produces the same bytes without touching the tree.

The second half matters as much: "instrumentation says 3" and "the bug is observable" are different claims. A counter that only exists in the new build cannot serve as its own control; the control has to be an assertion whose failure means the bug is present.

### Consequences

- Results live outside the repository (`_internal/<project>/negative-control/`); the public repo does not need a verification log, but the team does.
- The 0.1.2 check now has both: `one context served all three keystrokes` fails on 0.1.0 (id drift), and `three keystrokes caused three opens` proves the three opens really happened on the current build.

---

## 0016. Closed popouts are released lazily

**Date:** 2026-11-13 · **Status:** accepted, known limit

### Context

`ModifierTracker` keeps one listener set per document. A closed popout should release its entry. `pagehide` was tried first; measured on 1.15.1, it does not fire when Electron closes a popout — the tracked count stayed at 2 while the window was already gone from the target list.

### Decision

Sweep on `Window.closed` (or a null `defaultView`) at the start of every `attachDocument`, and delete the `pagehide` branch entirely.

### Rationale

`pagehide` also carried a bug: it read `evt.target.document`, which is undefined for a window target, and `detachDocument` then touched `doc.body`, which a closing window may have dropped. That exception would have propagated into `reconcile` and been swallowed by `HostPatcher`, silently skipping the shortcuts, badges and watcher for that bind — a rare failure that would have been very hard to attribute.

The sweep is lazy: a window that closes while nothing else opens stays referenced until the next surface opens. That costs one `Document` and four listeners, and the alternative — polling, or a window lifecycle event Obsidian does not expose — is more machinery than the leak is worth.

### Consequences

- A session that opens a popout and never opens another surface keeps that document referenced until unload. Accepted, and written down rather than left to be rediscovered.
- If a future Obsidian release starts firing `pagehide` for popouts, nothing breaks: the sweep still runs, and `stop()` covers the rest.
