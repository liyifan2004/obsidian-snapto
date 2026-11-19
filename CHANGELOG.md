# Changelog

All notable changes are recorded here. The format follows Keep a Changelog; versions follow SemVer.

## [Unreleased]

Ten defects found by running the plugin in a real Obsidian 1.15.1 instance
and by an independent audit of the code against its own documentation. All of
them were confirmed by measurement before the fix and by measurement after
it; every fix has a test that fails when the fix is reverted.

### Fixed

- **Auto confirm created files the user never asked for.** Obsidian renders a
  "press Enter to create <query>" row when a suggestion list has no match. Its
  value is `null`, and the plugin treated it as a result: the row was numbered
  as shortcut `1`, and because its title *was* the query, the match was exact,
  so auto confirm opened it — creating a new file. The placeholder is no
  longer a candidate and no longer gets a number.
- **A disabled scene could switch itself back on.** When the list went empty,
  the surface could no longer be classified, and the old code filed it under
  the generic plugin modal. The wrong scene's toggle then decided whether the
  shortcuts ran, so turning the "Quick switcher" scene off was undone as soon
  as the user typed something that matched nothing. A surface now keeps the
  scene it was confirmed to be.
- **`Ctrl+2` replaced the open note instead of opening a new tab.** Obsidian
  reads the modifier off the event it is handed to decide between the two. The
  plugin handed it a synthetic event with no modifier flags, so the modifier
  was dropped. The key event now travels with the choice.
- **Turning the number shortcuts off left the numbers on screen.** The digits
  and the number keys are one feature, so they answer the same question now.
- **The runtime check's first assertion could not fail.** It read a flag that
  was true for the whole session. The check now reads whether the wrapper is
  still the property the host calls, plus how many surfaces it has seen.
- **The badge on a row could point at a different row than `Ctrl+N` opened.**
  What counted as a result was decided twice — by DOM class for the badges and
  by the value's type for the candidates — and the two disagreed on a group
  header that carried another type. There is now one list of pickable rows and
  one numbering, so the two cannot drift apart.
- **A third party's decoration row could make the plugin match the wrong
  note.** When the row count and the value count drift, rows were paired with
  values by position, so "Alpha" was read off the decoration row's text. Rows
  are now matched to values by their text; a value with no matching row gets
  none rather than a wrong one.

### Changed

- The settings descriptions now say what the code does: `ignoreSeparators`
  flattens every match to the normalized level rather than "applying to
  normalized matches only", and the conflict policies take the strongest or
  the weakest match rather than "the first" or "the last result".
- The README separates what is technically out of reach from what is not
  built yet, and describes the match strength as a floor rather than a
  ladder.
- `scripts/check-api-since.mjs` compares the `@since` annotation of every
  documented API the plugin uses against `minAppVersion`. It found
  `Plugin.onExternalSettingsChange`, which is `@since 1.5.7` while the floor
  is `1.5.0`; the gap is now recorded in the compatibility table.

### Tests

- 132 → 164.
- Three behaviours that users can feel had no test guarding them and now
  have one: the manual-navigation back-off, the weight that decides which of
  two equally-matching rows wins, and whether the number key is swallowed
  after a choice.

## [0.1.2] - 2026-11-13

Turning a scene off now stays off.

### Fixed

- A disabled scene no longer comes back on the next keystroke. State is derived by one idempotent `reconcile` that every path calls, instead of three branches that each remembered part of the rule.
- Re-enabling a scene after disabling it restores auto match as well as shortcuts and badges; the watcher used to stay gone until the surface was reopened.
- `select-result-N` and `match-now` ignore surfaces whose scene is disabled, and so does the arrow-key back-off.
- An empty result set no longer counts as a closed surface. It used to drop the watcher and give the context a new id when results came back.
- Modifier listeners for a closed popout are released. Electron does not fire `pagehide` there, so `Window.closed` is swept whenever a surface opens.
- Settings changed by another device are picked up without a reload (`onExternalSettingsChange`).

### Changed

- `SearchContextManager` lost an unused listener registry and `types` lost the unused `SearchAdapter`.
- The runtime check now exercises a real `AbstractInputSuggest` (the property-name field) for dedupe, instead of the quick switcher, where the assertion could not fail.
- Settings changes prune closed surfaces before reconciling, and a surface showing no results no longer shadows a usable one below it.
- Removed internal collaboration documents from the repository. No runtime behaviour is affected; the old commits still contain them.

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
