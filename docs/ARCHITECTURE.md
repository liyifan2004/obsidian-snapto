# Architecture

## Shape

```
src/
├── main.ts                     wiring only: settings, commands, lifecycle
├── core/
│   ├── HostPatcher.ts          the one place Obsidian prototypes are wrapped
│   ├── adapters/
│   │   └── SuggestionAttacher.ts   host instance → SuggestionContext (+ scene)
│   ├── SuggestionContext.ts    one live list: read rows, move highlight, confirm
│   ├── SearchContextManager.ts registry of live contexts, newest first
│   ├── MatchEngine.ts          pure: normalize, classify, sort, resolve ties
│   ├── ShortcutManager.ts      Mod+1..9 on the context's own scope
│   ├── AutoMatchManager.ts     per-context debounce + decision
│   ├── BadgeRenderer.ts        the 1..9 labels
│   └── ModifierTracker.ts      modifier key state, arrow-key activity
├── settings/
│   ├── DefaultSettings.ts      types + untrusted-input migration
│   └── SettingsTab.ts          the settings page
├── i18n/index.ts               en / zh dictionaries
├── types/index.ts              vocabulary shared by everything
└── utils/                      dom.ts, debounce.ts
```

Dependencies point inward: `utils` → `types` → `core` → `main`. Nothing in `core/MatchEngine.ts` imports Obsidian, which is why it can be tested directly.

## Data flow

### Opening a list

```
Obsidian calls SuggestModal.open()
  → HostPatcher wrapper calls the original
  → onSurfaceOpen(SuggestionAttacher.attachSuggestModal)
      reads chooser / resultContainerEl / inputEl / scope
      resolves the scene lazily from the first value
      builds SuggestionContext
  → SearchContextManager.add(context)          ← becomes "active"
  → ShortcutManager.sync(context)              ← Mod+1..9 on context.scope
  → AutoMatchManager.watch(context)            ← MutationObserver on the row container
  → BadgeRenderer.apply(context)               ← labels for the first nine rows
```

`SearchContextManager` keeps *every* live context, newest last. `active()` returns the most recent one whose container is still attached, which is what makes nested surfaces (a modal over a popover) behave.

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

No global listener, no `preventDefault` from our side beyond returning `false` to the keymap. If the number exceeds the list, the handler returns `undefined`, the key falls through, and any native binding still works.

## Lifecycle

| Event | What happens |
| --- | --- |
| Surface opens | `pruneDead()` runs first, then attach |
| Surface closes | Obsidian pops the scope; our handlers stop firing. The context stays in the registry until the next open, where `pruneDead()` disposes it |
| Settings change | Modifier tracker updated; every live context re-synced through `ShortcutManager.sync` |
| Plugin unload | Prototypes restored, keymap handlers unregistered, observers disconnected, badges removed, tracker stopped |

`pruneDead()` exists because "closed" is not an event we can observe for every host: some close the modal, some just detach the container. Liveness is therefore derived (`containerEl.isConnected && values.length > 0`) and acted on at the next opportunity.

## What is deliberately absent

- **No global key listener for number keys.** Bindings live on the host's scope.
- **No `innerHTML`.** DOM is built with `createEl` / `createSpan`.
- **No style assignment in TypeScript.** All appearance is in `styles.css`, scoped to `.snapto-*` classes.
- **No vault access.** The plugin never enumerates files; it only reads what the list already shows.
- **No network.** Nothing leaves the machine.
