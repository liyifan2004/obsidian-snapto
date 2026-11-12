# Changelog

All notable changes are recorded here. The format follows Keep a Changelog; versions follow SemVer.

## [0.1.1] - 2026-11-13

Lifecycle and window fixes. No new settings, no behaviour change for the quick switcher.

### Fixed

- One context per host instance. `PopoverSuggest.open()` fires on every keystroke, so typing produced a new context, nine key handlers, an observer and an auto-match timer per character.
- Unloading no longer deletes a wrapper installed after ours. If another plugin patched the same method later, our layer stays in the chain as a transparent forwarder instead of tearing theirs out.
- Popout windows now work. Elements are matched by shape rather than `instanceof`, which is false across realms; the modifier tracker keeps one listener per document; the query is read from `.value` by shape, so auto match runs there too.
- Turning a scene off applies immediately to surfaces that are already open.
- The click fallback clicked the wrong row on any list containing group headers.

### Changed

- `isDesktopOnly` is now `true`. The feature is a modifier plus a digit, with no touch equivalent.
- Default minimum match strength stays `contains`; highlighting deliberately carries no extra gate.

### Docs

- Version table in `API_COMPATIBILITY.md` now separates bundle reading (1.5.12, 1.13.4) from the runtime baseline (1.15.1).
- `FEATURE_MATRIX.md` gained an environment table and the actual shape of link-suggest values.

## [0.1.0] - 2026-11-13

First working build. Not yet submitted to the community directory.

### Added

- Number shortcuts (`Mod` + `1`-`9`) that select a result in the quick switcher, the command palette, editor suggestions and suggestion modals opened by other plugins.
- Auto match: after the result list stops changing for a configurable delay, move the highlight onto the best match.
- Optional auto confirm, restricted to exact and normalized matches.
- Result numbers 1-9, shown while the modifier is held.
- Settings page with global options and per-scene switches; English and Chinese interface.
- Commands: `match-now`, `toggle-auto-match`, `select-result-1` … `select-result-9`.

### Notes

- Global search panel, in-note find and outline search are out of scope; reasons in `docs/FEATURE_MATRIX.md`.
- Auto match does not run in editor suggestions: the query lives in the editor buffer, not in an input the plugin can read.
