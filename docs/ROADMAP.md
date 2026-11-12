# Roadmap

## Done (0.1.0)

- Quick select on the host's keymap scope: quick switcher, command palette, editor suggests, plugin modals.
- Auto match with debounce, generation guard, and manual-navigation back-off.
- Confirm gate: exact/normalized only.
- Badges 1-9, shown while the modifier is held.
- Settings page, bilingual, per-scene switches.
- 95 unit tests; verified end to end against Obsidian 1.15.1.

## Next

1. **Popover suggests in the wild.** `AbstractInputSuggest` and friends are wired, but no third-party surface was exercised. Pick two popular plugins that use them and re-run the runtime check.
2. **Light theme and popout windows.** Only the dark theme in the main window has been looked at. Contrast and badge placement need a pass in both, plus one popout window.
3. **`Plugin.onExternalSettingsChange`.** Settings edited on another device are not picked up until reload.
4. **Command alternatives for users who prefer Obsidian hotkeys.** Nine `select-result-N` commands exist; document a worked example of binding `Alt+1..9`.
5. **Keyboard navigation of the badge state.** Today arrow keys suppress auto match for 1.2 s. A shorter, configurable value would suit fast typists.

## Later

- **Global search panel.** Needs its own adapter and a decision about what "select" means without a selection model. See [TECHNICAL_DECISIONS.md](TECHNICAL_DECISIONS.md) 0008.
- **More than nine results.** Would need a two-key scheme (e.g. `Mod+g` then digit); no design yet.
- **Fuzzy ranking parity with the host.** Our fuzzy score is a simple subsequence heuristic; matching the host's ordering exactly would require reimplementing it, which is the kind of coupling worth avoiding.

## Not doing

- A new search box, a heading index, or anything that duplicates switcher plugins. SnapTo reacts to lists that already exist.
- Telemetry, network calls, or vault-wide scans.
