# Roadmap

## Done (0.1.2)

- Turning a scene off now stays off: state converges through one idempotent reconcile instead of three branches.
- Commands, `match-now` and the arrow-key tracker ignore disabled scenes.
- An empty result set no longer counts as a closed surface.
- Modifier listeners for closed popouts are released.
- Settings synced from another device are picked up without a reload.

## Done (0.1.1)

- One context per host instance; unloading no longer removes a wrapper installed after ours.
- Popout windows: badges, shortcuts and auto match all work there.
- Scene toggles applied only until the next keystroke (fixed in 0.1.2).
- Click fallback aligned with the read path.

## Done (0.1.0)

- Quick select on the host's keymap scope: quick switcher, command palette, editor suggests, plugin modals.
- Auto match with debounce, generation guard, and manual-navigation back-off.
- Confirm gate: exact/normalized only.
- Badges 1-9, shown while the modifier is held.
- Settings page, bilingual, per-scene switches.
- 95 unit tests; verified end to end against Obsidian 1.15.1.

## Next

1. **Popover suggests in the wild.** `AbstractInputSuggest` and friends are wired, but no third-party surface was exercised. Pick two popular plugins that use them and re-run the runtime check.
2. **Light theme.** Only the dark theme has been looked at. Badges use theme variables only, but contrast has not been measured.
3. **Command alternatives for users who prefer Obsidian hotkeys.** Nine `select-result-N` commands exist; document a worked example of binding `Alt+1..9`.
4. **Keyboard navigation of the badge state.** Today arrow keys suppress auto match for 1.2 s. A shorter, configurable value would suit fast typists.
5. **A `@since` check against `minAppVersion`.** `Plugin.onExternalSettingsChange` is `@since 1.5.7` while `minAppVersion` is `1.5.0`, so the API compatibility table has to be maintained by hand today. A script that compares the `@since` annotations of everything the plugin calls against `minAppVersion` would keep the two honest.

## Later

- **Global search panel.** Needs its own adapter and a decision about what "select" means without a selection model. See [TECHNICAL_DECISIONS.md](TECHNICAL_DECISIONS.md) 0012.
- **More than nine results.** Would need a two-key scheme (e.g. `Mod+g` then digit); no design yet.
- **Fuzzy ranking parity with the host.** Our fuzzy score is a simple subsequence heuristic; matching the host's ordering exactly would require reimplementing it, which is the kind of coupling worth avoiding.

## Not doing

- A new search box, a heading index, or anything that duplicates switcher plugins. SnapTo reacts to lists that already exist.
- Telemetry, network calls, or vault-wide scans.
