# Feature matrix

Every search surface in Obsidian, whether SnapTo supports it, and why.

Verification source is stated per row. "Read" means the behaviour was confirmed by reading Obsidian's own bundle (`obsidian.asar` → `app.js`, version 1.5.12). "Runtime" means it was exercised in the app. Nothing in this table is marked supported on the strength of a compile passing.

## Control levels

| Level | Meaning | Cost of a mistake |
| --- | --- | --- |
| **A** | Achievable with documented API only. | Low. |
| **B** | Documented API plus DOM conventions (class names, event delegation). | Medium: breaks visually before it breaks silently. |
| **C** | Depends on internal fields not in `obsidian.d.ts`. | High: a refactor in Obsidian disables a scene without warning. |
| **D** | Not reliably achievable. | — |

SnapTo lives at **C** for list reading and at **B** for the click fallback. That is the honest state of the art: Obsidian exposes no API for "the suggestion list that is currently open".

## Supported

| Surface | Real UI type | Query | Candidates | Selected row | Choose a row | Watch changes | Level | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Quick switcher | `SuggestModal` → `FuzzySuggestModal` | `inputEl.value` | `chooser.values` + `.suggestion-item` rows | `chooser.selectedItem` | `setSelectedItem` + `useSelectedItem` | `MutationObserver` on `resultContainerEl` | C | Implemented; shortcuts, auto match, confirm and badges verified at runtime |
| Command palette | `SuggestModal` | same | same | same | same | same | C | Implemented; scene and badges verified at runtime, matching exercised on a single-result list |
| Plugin suggestion modals (third-party) | `SuggestModal` subclass | same | same | same, DOM click as fallback | same | C | Implemented; structure shared with the switcher, no third-party modal exercised |
| Internal link suggest | `EditorSuggest` | not exposed (editor text) | `suggestions.values` + rows | `suggestions.selectedItem` | same | same | C | Verified at runtime: typing `[[` then `Ctrl+2` inserts `[[会议纪要]]` |
| Tag suggest | `EditorSuggest` → `PopoverSuggest` | not exposed | same | same | same | same | C | Same adapter as links; not exercised in a tag popup |
| Property / frontmatter suggest | `EditorSuggest` or `PopoverSuggest` | depends on host | same | same | same | same | C | Same adapter; not exercised |
| Input-attached suggests | `AbstractInputSuggest` → `PopoverSuggest` | `textInputEl.value` | same | same | same | same | C | Implemented; no third-party surface exercised |

## Not supported

| Surface | Why not | Level | What it would take |
| --- | --- | --- | --- |
| Global search panel (left sidebar / search view) | Results are `.search-result` blocks in a scrolling pane with no selection model. There is no "current row" to move, and no API to choose one. Auto match would have to click a result, which is a side effect, not a selection. | D | A separate adapter with its own highlight layer, plus a decision about closing the panel. Deferred, not impossible. |
| In-note find (`Ctrl+F`) | It is a CodeMirror search panel (`.cm-search`) that highlights matches inside the document. There is no candidate list to select from, so neither feature applies. | D | Nothing reasonable. Different problem. |
| Native outline search | Obsidian's Outline core plugin is a *view* listing headings. It has no search input. Heading search exists only in third-party plugins (Quick Switcher++, Better Quick Switcher) and is that plugin's own feature. | D | Not a SnapTo feature; would mean shipping a second search product. |
| File explorer filter | Filters the file tree in place. No suggestion list, no rows to choose. | D | — |
| Workspace switcher | No such native surface in Obsidian 1.5.12. Workspace switching appears in third-party switchers only. | D | — |
| Community plugin browser search | Runs inside the settings modal, results are cards in a settings tab. Not a suggestion list. | D | — |
| Settings page search | A settings field, not a result list. | D | — |

## Notes that changed the plan

1. **"Outline search" does not exist natively.** The brief listed it; the app does not have it. Implementing it would mean building a vault-wide heading index and a new modal — a different plugin. Recorded as out of scope rather than faked.
2. **In-note find is not a list.** It was dropped for the same reason: there is nothing to select.
3. **Global search is the only surface where "auto navigation" and "auto selection" genuinely differ.** Selecting has no meaning there; only navigation does. Rather than ship half a feature, it is deferred with the reason written down.
4. **Editor suggests cannot auto match.** Their query lives in the editor buffer, not in an input the plugin can read reliably. Selection shortcuts still work, because they only need the list.
5. **Scene detection is heuristic.** A modal is classified from the shape of its first value (`Command` → command palette, file-like → quick switcher, otherwise generic). A wrong guess costs a scene-specific toggle, never a broken shortcut: the generic `plugin-modal` fallback still supports both features.

## Runtime verification log

| Date | Obsidian | Checked |
| --- | --- | --- |
| 2026-11-13 | 1.15.1 | Quick switcher: scene detection, `Ctrl+2` opening the expected note, auto match moving the highlight (`last`) and staying put (`unique`), auto confirm on exact only, badges rendering while the modifier is held, per-scene switch disabling cleanly. Command palette: scene detection and badges. Editor link suggest: `Ctrl+2` inserting `[[会议纪要]]`. Settings page: renders in a separate window, 23 rows, Chinese copy. |
| 2026-11-13 | 1.5.12, 1.13.4 | Bundle read only: internal fields (`chooser`, `scope`, `values`, `setSelectedItem`, `useSelectedItem`) confirmed present in both. |

Not exercised at runtime: input-attached popovers from third-party plugins, tag and property popups, popout windows, light theme, mobile touch.
