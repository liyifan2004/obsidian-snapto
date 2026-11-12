# Development

## Commands

```bash
npm install
npm run dev        # esbuild watch → main.js
npm run build      # production bundle
npm run typecheck  # tsc --noEmit
npm test           # vitest run
npm run lint       # eslint with eslint-plugin-obsidianmd
npm run verify     # typecheck + test + lint + build
npm run sync "<vault path>"
```

`verify` is the gate before every commit. `sync` copies `main.js`, `manifest.json`, `styles.css` into `<vault>/.obsidian/plugins/snapto/`; it never touches `data.json`.

`main.js` is not in git — it ships as a release asset.

## Testing

`vitest` with `jsdom`. `test/setup/obsidian-dom.ts` adds the small set of Obsidian DOM helpers the code uses (`createEl`, `addClass`, `instanceOf`, …). `test/mocks/obsidian.ts` stubs the module so type-only imports resolve.

| File | Covers |
| --- | --- |
| `MatchEngine.test.ts` | Levels, full-width folding, CJK, ties, score order |
| `Settings.test.ts` | Untrusted `data.json`: missing fields, wrong types, `0`/`false` as real values, clamping |
| `SuggestionContext.test.ts` | Row/value alignment, group headers, commit paths, liveness |
| `SuggestionAttacher.test.ts` | Scene detection, including `{match,item}` and `{type,file}` wrappers |
| `AutoMatchManager.test.ts` | Highlight vs confirm, the confidence gate, tie policies |
| `SurfaceBinder.test.ts` | One context per host, reuse, closed-surface replacement, disabled scene |
| `ModifierTracker.test.ts` | One listener per document, body class on keydown/keyup, multi-window cleanup |
| `ShortcutManager.test.ts` | Registration per number, index mapping, fall-through, re-registration |
| `HostPatcher.test.ts` | Notification, prototype restore, no stacking, failing handler isolation |
| `SearchContextManager.test.ts` | Active selection, pruning, listeners |
| `Debounce.test.ts` | Stale generations dropped |

What is **not** covered by unit tests: real keymap dispatch, real DOM rendering, the settings page, popout windows, mobile touch (mobile is out of scope).

Two of the bugs fixed in 0.1.1 were invisible to unit tests and to a single manual click: duplicate contexts per keystroke, and a click fallback that only misbehaved when a list had group headers. Both now have a regression test plus a runtime assertion.

## Verifying against a real Obsidian

The interesting failures (wrong scene, wrong index, no badge) only appear at runtime. The loop used here:

1. Add `--remote-debugging-port=9333 --user-data-dir=<scratch dir>` to a **second** Obsidian instance so the user's own session is untouched.
2. Point it at a scratch vault with the plugin installed and enabled in `community-plugins.json`.
3. `GET http://127.0.0.1:9333/json/list`, connect over WebSocket, `Runtime.evaluate`.
4. Drive the real path — `app.commands.executeCommandById("switcher:open")`, set `input.value` and dispatch `input`, dispatch a `KeyboardEvent` on `window` — then read back `app.workspace.getActiveFile()`, `.suggestion-item.is-selected`, `.snapto-index`.
5. `Page.captureScreenshot` for the visual pass; the settings live in a separate window and need their own CDP target.

Start and stop the instance inside one shell command, otherwise the child process is reaped when the command ends.

### Check list for a new Obsidian release

- [ ] `SuggestModal.chooser`, `.resultContainerEl`, `.inputEl`, `Modal.scope` still exist
- [ ] `Suggestions.values` / `.selectedItem` / `.setSelectedItem` / `.useSelectedItem` still exist
- [ ] Suggestion values are still wrappers (`{match,item}`, `{type,file}`)
- [ ] Quick switcher: number key opens the expected note
- [ ] Auto match moves the highlight with `last` policy, stays put with `unique`
- [ ] Confirm opens only on exact/normalized
- [ ] Badges appear while the modifier is held, and rows do not shift
- [ ] Settings page renders and a change takes effect without reloading

If a wrapper shape changes, `detectModalScene` misclassifies and the scene toggle in settings stops matching — the shortcut still works, which makes this easy to miss. Check the scene name, not just the shortcut.

## Layout rules

- Style only `.snapto-*` classes. Never style `.suggestion-item` or other core classes.
- No `.style.` assignment in TypeScript; use CSS classes (`setCssProps` for genuinely dynamic values).
- No `innerHTML`. `createEl` / `createSpan` only.
- Command ids must not repeat the plugin id.
- Any new API: check its `@since` in `node_modules/obsidian/obsidian.d.ts` against `minAppVersion`.

`npm run lint` surfaces all of the above, plus the Obsidian review rules. One warning is knowingly accepted: `settings-tab/prefer-setting-definitions` — the declarative settings API needs Obsidian 1.13, while `minAppVersion` is 1.5.0.
