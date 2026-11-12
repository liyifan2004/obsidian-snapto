# API compatibility

What SnapTo touches, which Obsidian versions were checked, and what happens when a version moves.

## How this was checked

Two shipped bundles were unpacked and read (`resources/obsidian.asar` → `app.js`):

| Install | Bundle reports | Use |
| --- | --- | --- |
| an older install left behind on disk | 1.5.12 | bundle read only |
| the install in use | 1.13.4 | bundle read only |
| the same install after an in-app update | 1.15.1 | runtime baseline |

Bundle reading covers 1.5.12 and 1.13.4. Everything described as verified at runtime was exercised on **1.15.1** in an isolated vault (`--remote-debugging-port`, separate `--user-data-dir`), driving the real keymap and the real suggestion lists.

Symbol names in the bundle are minified, so class identity was resolved through the export table (`SuggestModal:()=>ww`, `PopoverSuggest:()=>wR`, …) before reading the implementation.

## Public API in use

Nothing here is internal; these are safe.

| API | Since | Used for |
| --- | --- | --- |
| `Plugin`, `PluginSettingTab`, `Setting` | 0.9.x | Lifecycle and settings |
| `Setting.setHeading()` | 0.9.16 | Section titles without hand-written `h2` |
| `Scope.register()` | 0.9.x | Binding number keys to a surface |
| `SuggestModal`, `PopoverSuggest`, `Modal` | 0.9.x | The two classes that are wrapped |
| `createEl` / `createSpan` / `createDiv` | 0.15.0 | DOM construction |
| `Platform.isMacOS` | 0.9.x | Modifier mapping |
| `moment.locale()` | bundled | Interface language |
| `activeDocument` | 0.15.0 | Current window's document |

`getLanguage()` (1.8.7+) is deliberately not used: `moment.locale()` covers the same need without raising `minAppVersion`.

`HTMLElement.instanceOf()` is not used either. It compares against the constructor of the current window, so a node created by a popout reports false — measured on 1.15.1, not assumed. Element checks go through `isElementLike` (shape: `nodeType === 1` plus `querySelectorAll`) instead.

## Internal fields in use

These are **not** in `obsidian.d.ts`. They are read through `readProp()` in `src/utils/dom.ts`, so a rename yields `null` and the surface is skipped instead of throwing.

| Host | Field | Purpose | 1.5.12 | 1.13.4 | 1.15.1 runtime |
| --- | --- | --- | --- | --- | --- |
| `Modal` | `scope` | Keymap scope the host pushes while open | ✔ | ✔ | ✔ |
| `SuggestModal` | `chooser` | Suggestion list object | ✔ | ✔ | ✔ |
| `SuggestModal` | `resultContainerEl` | Row container (`div.prompt-results`) | ✔ | ✔ | ✔ |
| `SuggestModal` | `inputEl` | Query source | ✔ | ✔ | ✔ |
| `Suggestions` | `values` | Raw items | ✔ | ✔ | ✔ |
| `Suggestions` | `suggestions` | Row elements | ✔ | ✔ | ✔ |
| `Suggestions` | `selectedItem` | Highlight index | ✔ | ✔ | ✔ |
| `Suggestions` | `containerEl` | Scroll container | ✔ | ✔ | ✔ |
| `Suggestions` | `setSelectedItem(i, evt)` | Move highlight (wraps out-of-range indices) | ✔ | ✔ | ✔ |
| `Suggestions` | `useSelectedItem(evt)` | Confirm | ✔ | ✔ | ✔ |
| `PopoverSuggest` | `suggestions`, `suggestEl`, `textInputEl`, `scope` | Popover list | ✔ | ✔ | ✔ |
| `EditorSuggest` | `context` | Distinguishes editor suggests from input popovers | ✔ | ✔ | ✔ |

## Observed differences between 1.5.12 and 1.13.4

None of them broke the plugin; they are recorded so a future adapter change does not trip over them.

| Change | Effect on SnapTo |
| --- | --- |
| `setSuggestions()` now assigns `values` before rendering (was: render then assign) | None. Rows and values are read after the mutation settles. |
| `onSuggestionClick` gained an `if (!e.defaultPrevented)` guard | None. The DOM-click fallback dispatches a non-prevented event. |
| `selectOnHover` / `shouldSelectOnHover()` added | Mouse hover can move the highlight. Treated as user intent, same as an arrow key. |
| `selectActiveSuggestion(evt)` added to `SuggestModal` | Unused. `useSelectedItem()` works on both versions and on popovers. |
| Suggestion values are wrappers: `{ match, item }` (fuzzy modals) or `{ type, file, match, downranked }` (quick switcher) | Handled by `unwrapSuggestion()`; this was found by runtime testing, not by reading. |

## DOM contracts

| Contract | Stability |
| --- | --- |
| `.suggestion-item` rows inside the list container | Stable. Every suggester in the ecosystem uses it; Obsidian's own click delegation targets it. |
| `.suggestion-title` / `.suggestion-content` / `.suggestion-note` | Stable, defined in `app.css`. Used only to pick the row's title, with `textContent` as fallback. |
| `.mod-group` on header rows | Stable. |
| `div.prompt-results` | Not used as a selector — the container comes from `resultContainerEl`. |

SnapTo does **not** style `.suggestion-item` or any other core class. Badges are elements we create and remove.

## Two behaviours worth knowing

**`setSelectedItem` wraps.** `setSelectedItem(-1)` jumps to the last row and `setSelectedItem(length)` jumps to the first. Nothing in SnapTo relies on this, but it explains why an off-by-one never throws — it silently lands somewhere plausible. Tests assert the exact index for that reason.

**`instanceOf` is per realm.** Obsidian adds `HTMLElement.prototype.instanceOf`, which compares against the constructor of the current window, so a node from a popout reports false. SnapTo makes no realm comparison at all: elements are matched by shape in `isElementLike`, and input values are read by their `.value` shape.

## Failure modes

| Situation | Behaviour |
| --- | --- |
| Popout window | Works. Elements are matched by shape, and the modifier tracker keeps one listener per document. Verified at runtime: badges visible, `Ctrl+2` opened the expected note in a second window. |
| Same host opens repeatedly | One context. `PopoverSuggest.open()` fires on every keystroke; the binder keys contexts by host instance. |
| `chooser` missing (renamed) | `attachSuggestModal` returns `null`; that surface gets no features. |
| `scope` missing | Shortcuts are skipped for that surface; auto match still runs. |
| `values` not an array | Treated as empty; context reports dead and is pruned. |
| Rows and values out of sync (extra decoration rows) | Candidates are paired by order of non-group rows; text falls back to the value. |
| Wrapped handler throws | `HostPatcher` swallows it so the native `open()` still completes. |
| Unload | Prototype own-properties are deleted, keymap handlers unregistered, observers disconnected. |

## Version policy

`minAppVersion` is `1.5.0`, `isDesktopOnly` is `true`. Everything SnapTo calls exists in 1.5.0; the internal fields above were confirmed by reading 1.5.12 and 1.13.4 and by running 1.15.1.

Desktop only is a product decision, not a technical limit: the feature is a modifier plus a digit, which has no mobile equivalent. See decision 0010.

If a future Obsidian release changes the internal shape, the affected surface degrades to "no SnapTo features", never to "broken search". The check list for re-verification is in [DEVELOPMENT.md](DEVELOPMENT.md).
