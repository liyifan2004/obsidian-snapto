# Changelog

All notable changes are recorded here. The format follows Keep a Changelog; versions follow SemVer.

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
