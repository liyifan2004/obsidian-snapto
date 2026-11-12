# Architecture

## Shape

```
src/
├── main.ts                     wiring, settings, commands, reconcile
├── core/
│   ├── HostPatcher.ts          the one place Obsidian prototypes are wrapped
│   ├── adapters/
│   │   └── SuggestionAttacher.ts   host instance → SuggestionContext (+ scene)
│   ├── SurfaceBinder.ts        one context per host instance, nothing else
│   ├── SuggestionContext.ts    one live list: read rows, move highlight, confirm
│   ├── SearchContextManager.ts registry of live contexts, newest first
│   ├── MatchEngine.ts          pure: normalize, classify, sort, resolve ties
│   ├── ShortcutManager.ts      Mod+1..9 on the context's own scope
│   ├── AutoMatchManager.ts     per-context debounce + decision
│   ├── BadgeRenderer.ts        the 1..9 labels
│   └── ModifierTracker.ts      modifier state across documents, arrow activity
├── settings/
│   ├── DefaultSettings.ts      types + untrusted-input migration
│   └── SettingsTab.ts          the settings page
├── i18n/index.ts               en / zh dictionaries
├── types/index.ts              vocabulary shared by everything
└── utils/                      dom.ts, debounce.ts
```

Dependencies point inward: `utils` → `types` → `core` → `main`. `MatchEngine` imports nothing from Obsidian, which is why it can be tested directly.

## Data flow

### Opening a list

```
Obsidian calls SuggestModal.open()
  → HostPatcher wrapper calls the original, then reports the instance
  → SurfaceBinder.bind(host, attach)
      prune dead surfaces
      findByHost(host) ─┬─ found → touch + onBind         (repeat open)
                        └─ empty → attach → add → onBind  (first open)
  → main.onBind = reconcile(context)
      attachDocument(context's document)
      syncContext   → ShortcutManager.sync (signature-gated)
      refreshBadges → draw or clear
      watch         → AutoMatchManager.watch (no-op if already watching)
```

`SearchContextManager` keeps *every* live context, newest last, and does no filtering: which one to act on depends on scene settings it knows nothing about. `main.activeEnabledContext()` walks that list newest-first and picks the first context that is alive, belongs to an enabled scene, and currently has results — a surface showing "no results" cannot answer a command and must not shadow a usable one below it.

### Typing

```
input event → Obsidian rebuilds the row container
  → MutationObserver fires (childList only)
      → BadgeRenderer.apply()          labels follow the new rows
      → GenerationDebouncer.schedule(delayMs)
          ... idle ...
          → AutoMatchManager.evaluate(generation)
              stale generation? → drop
              query empty / item already chosen by hand? → drop
              matchAll() → resolveConflict() → act (highlight or confirm)
```

Watching the list instead of the input is what makes surfaces without an `inputEl` (editor suggests) work at all: they mutate the same kind of container.

### Pressing a number

```
window keydown (capture) → Obsidian Keymap → top scope
  → our handler on the modal's own scope
      context.commit(candidate.index)
          → list.setSelectedItem(index, event)
          → list.useSelectedItem(event)      → host's selectSuggestion()
```

No global listener. If the number exceeds the list, the handler returns `undefined`, the key falls through, and any native binding still works.

## Scene state converges in one place

`reconcile()` is the only writer of the three derived states — shortcuts, badges, watcher — and every path calls it: first attach, repeat open, settings change, external settings sync.

The alternative was tried in 0.1.1 and failed. Turning a scene off disposed shortcuts, stopped the watcher and cleared badges; the next keystroke went through the reuse branch, which synced shortcuts using only `quickSelectEnabled`, so all three came back. Three branches each remembering part of the rule is what allowed that.

Two consequences worth knowing:

- **A disabled scene keeps its context.** Removing it would mean the surface cannot come back until it is reopened, and a modal does not reopen on its own. Instead `activeEnabledContext()` filters disabled scenes out of every consumer: commands, `match-now`, and the arrow-key tracker.
- **`watch` is idempotent and is called even for disabled scenes.** `buildConfig` returns null for them, so the observer fires and does nothing. A watcher is never torn down on the settings path, because a torn-down watcher is exactly what could not come back.

## Multiple documents

Popout windows are separate documents in the same renderer. Three things follow:

- Element checks are shape-based (`isElementLike`), because `instanceof HTMLElement` compares against the current realm's constructor and is false for a node from another window.
- `ModifierTracker` keeps one listener set per document and applies the body class to each document's own `body`.
- Documents are released on `Window.closed`, swept whenever a surface opens. `pagehide` is registered as well, but Electron does not fire it for a popout close — measured, not assumed.

## Lifecycle

| Event | What happens |
| --- | --- |
| Surface opens | `pruneDead()`, then bind → reconcile |
| Surface closes | Obsidian pops the keymap scope; handlers stop firing. The context stays in the registry until the next open, where `pruneDead()` disposes it |
| Settings change | Modifier tracker updated; every live context reconciled |
| Plugin unload | Prototypes restored, keymap handlers unregistered, observers disconnected, badges removed, tracker stopped |

`pruneDead()` exists because "closed" is not an observable event for every host: some close the modal, some just detach the container. Liveness is derived (`containerEl.isConnected`) and acted on at the next opportunity.

Aliveness deliberately ignores `values.length`. An empty result set is a normal state; treating it as death used to drop the watcher and hand the context a new id when results came back.

## What is deliberately absent

- **No global key listener for number keys.** Bindings live on the host's scope.
- **No `innerHTML`.** DOM is built with `createEl` / `createSpan`.
- **No style assignment in TypeScript.** All appearance is in `styles.css`, scoped to `.snapto-*`.
- **No vault access.** The plugin never enumerates files; it only reads what the list already shows.
- **No network.** Nothing leaves the machine.
- **No listener registry on `SearchContextManager`.** With one consumer, a subscribe/emit pair is just a second place for state to drift.
