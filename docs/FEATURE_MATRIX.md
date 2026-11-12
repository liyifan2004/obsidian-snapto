# Feature matrix

Every search surface in Obsidian, whether SnapTo supports it, and why.

Verification source is stated per row. "Bundle" means the behaviour was confirmed by reading Obsidian's own `app.js` (from `obsidian.asar`, versions 1.5.12 and 1.13.4). "Runtime" means it was exercised in the app, against 1.15.1. Nothing here is marked supported on the strength of a compile passing.

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
| Quick switcher | `SuggestModal` → `FuzzySuggestModal` | `inputEl.value` | `chooser.values` + `.suggestion-item` rows | `chooser.selectedItem` | `setSelectedItem` + `useSelectedItem` | `MutationObserver` on `resultContainerEl` | C | Runtime: scene detection, number key opens the expected note, auto match moves and holds, confirm on exact only, badges |
| Command palette | `SuggestModal` | same | same | same | same | same | C | Runtime: scene detection and badges. Matching exercised on a single-result list only |
| Plugin suggestion modals (third-party) | `SuggestModal` subclass | same | same | same | same, DOM click as fallback | same | C | Same code path as the switcher; no third-party modal exercised |
| Internal link suggest | `EditorSuggest` | not exposed (editor text) | `suggestions.values` + rows | `suggestions.selectedItem` | same | same | C | Runtime: typing `[[` then `Ctrl+2` inserts `[[会议纪要]]`; three further keystrokes keep one context |
| Tag suggest | `EditorSuggest` → `PopoverSuggest` | not exposed | same | same | same | same | C | Same adapter as links; not exercised in a tag popup |
| Property / frontmatter suggest | `EditorSuggest` or `PopoverSuggest` | depends on host | same | same | same | same | C | Same adapter; not exercised |
| Input-attached suggests | `AbstractInputSuggest` → `PopoverSuggest` | `textInputEl.value` | same | same | same | same | C | Implemented; no third-party surface exercised |

### What the link list actually contains

Values are `{ type, file, path, score, matches }` with `type: "file"`. The adapter unwraps `item`, then `file`, then the value itself, which covers this shape, `{ match, item }` from fuzzy modals, and plain strings. Other `type` values (`group`, `property-key`, `history`) were not observed in the lists reachable here, so they are handled by the generic "not a group header" rule rather than by a dedicated branch.

## Environment

| Environment | State |
| --- | --- |
| Main window | Supported, verified |
| Popout window | Supported, verified: badges appear while the modifier is held, `Ctrl+2` opens the expected note, and typing a full title selects that row |
| Mobile | Not supported. `isDesktopOnly: true`: the feature is a modifier plus a digit, and there is no touch equivalent |
| Light theme | Not verified. Badges use theme variables only, but no light-theme pass was run |

Popout support needed three fixes: elements are matched by shape instead of `instanceof` (a popout node fails it), the modifier tracker keeps one listener per document, and the input value is read by shape.

## Not supported

| Surface | Why not | Level | What it would take |
| --- | --- | --- | --- |
| Global search panel (left sidebar / search view) | Results are `.search-result` blocks in a scrolling pane with no selection model. There is no "current row" to move, and no API to choose one. | D | A separate adapter with its own highlight layer, plus a decision about closing the panel. Deferred to 0.2 at the earliest. |
| In-note find (`Ctrl+F`) | It is a CodeMirror search panel (`.cm-search`) that highlights matches inside the document. There is no candidate list. | D | Nothing reasonable. Different problem. |
| Native outline search | Obsidian's Outline core plugin is a *view* listing headings. It has no search input. | D | Not a SnapTo feature; would mean shipping a second search product. |
| File explorer filter | Filters the file tree in place. No suggestion list. | D | — |
| Workspace switcher | No such native surface in Obsidian 1.5.12-1.15.1. Appears in third-party switchers only. | D | — |
| Community plugin browser search | Runs inside the settings modal, results are cards in a settings tab. | D | — |
| Settings page search | A settings field, not a result list. | D | — |

## Notes that changed the plan

1. **"Outline search" does not exist natively.** The brief listed it; the app does not have it. Implementing it would mean building a vault-wide heading index and a new modal — a different plugin.
2. **In-note find is not a list.** Dropped for the same reason: there is nothing to select.
3. **Global search is the only surface where "auto navigation" and "auto selection" genuinely differ.** Selecting has no meaning there; only navigation does. Deferred with the reason written down instead of shipping half of it.
4. **Editor suggests cannot auto match.** Their query lives in the editor buffer, not in an input the plugin can read reliably. Selection shortcuts still work, because they only need the list.
5. **Scene detection is heuristic.** A modal is classified from the shape of its first value (`Command` → command palette, file-like → quick switcher, otherwise generic). A wrong guess costs a scene-specific toggle, never a broken shortcut.
6. **One host, one context.** `PopoverSuggest.open()` fires on every keystroke, so contexts are keyed by host instance. Without it, typing four characters produced four contexts and 36 key handlers. Covered by `SurfaceBinder.test.ts` and asserted in `scripts/runtime-check.mjs`.

## Runtime verification log

| Date | Obsidian | Checked |
| --- | --- | --- |
| 2026-11-13 | 1.15.1 | Quick switcher: scene detection, `Ctrl+2` opens the expected note, auto match moves (`last`) and holds (`unique`), confirm on exact only, badges while the modifier is held, per-scene switch disabling cleanly, one context after three re-types. Command palette: scene and badges. Link suggest: `Ctrl+2` inserts `[[会议纪要]]`, one context after three keystrokes. Settings page: 23 rows, Chinese copy. |
| 2026-11-13 | 1.15.1 | Popout window: prompt opens there, badges visible on modifier, `Ctrl+2` opens the expected note, typing a full title selects it, one context throughout. |
| 2026-11-13 | 1.5.12, 1.13.4 | Bundle read only: internal fields (`chooser`, `scope`, `values`, `setSelectedItem`, `useSelectedItem`) present in both. |

Not exercised at runtime: input-attached popovers from third-party plugins, tag and property popups, light theme, multi-monitor, mobile (excluded by manifest).
