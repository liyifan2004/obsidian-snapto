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

**Date:** 2026-11-13 · **Status:** accepted

### Context

The search view lists `.search-result` blocks. There is no selection model: nothing is "the current row", and no API selects one.

### Decision

Out of scope for the first release. Recorded in [FEATURE_MATRIX.md](FEATURE_MATRIX.md) as level D.

### Rationale

Supporting it means inventing a highlight layer and deciding whether choosing a result should close the panel — a different feature with its own interaction design, not an adapter. Shipping a half-version would make "SnapTo works everywhere" false in the one place users would notice.

### Consequences

- Revisit when the selection model exists, or build a deliberate navigation mode with its own settings.
