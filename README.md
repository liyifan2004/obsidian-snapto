English | [简体中文](README.zh.md)

# SnapTo

Pick results in Obsidian's search popups by number, and let an exact match select itself once you stop typing.

SnapTo does not add a search box of its own. It works on suggestion lists Obsidian already shows.

Working today, verified in the app:

- the quick switcher
- the command palette
- `[[` link completion in the editor
- suggestion dialogs opened by other plugins

Tag and property popups use the same code path as link completion but have not been exercised. Global search, in-note find and the outline are not supported; the reasons are in [docs/FEATURE_MATRIX.md](docs/FEATURE_MATRIX.md).

## What it does

**Number shortcuts.** Press `Ctrl` (or `Cmd` on macOS) with `1`-`9` to choose that result. The keys only answer while a suggestion list is open, so `Ctrl+1` keeps its normal meaning in a note.

**Auto match.** When the list stops changing for a second, SnapTo compares the query with the rows and moves the highlight onto the best match. Two things are deliberate:

- Moving the highlight is all it does by default. Confirming a selection is an opt-in, and even then it only happens on an exact or normalized match. Typing `note` will not open `notebook.md`.
- If more than one row matches equally well, it does nothing. Two files with the same name in different folders is common enough that guessing would make the plugin feel broken.

**Result numbers.** While the modifier is held, the first nine rows show a small digit. The digit is always laid out (just invisible) so rows never shift.

## What it does not do

- No global search panel support. The panel has no selection model to drive; see [docs/FEATURE_MATRIX.md](docs/FEATURE_MATRIX.md).
- No in-note find (`Ctrl+F`). It highlights text inside the document, it is not a result list.
- No native outline search. Obsidian's outline is a view, not a search box.

The full list of surfaces, environments and how each was verified is in [docs/FEATURE_MATRIX.md](docs/FEATURE_MATRIX.md).

## Install

Until the plugin is in the community directory:

1. Download `main.js`, `manifest.json` and `styles.css` from the latest release.
2. Put them in `<vault>/.obsidian/plugins/snapto/`.
3. Enable **SnapTo** in Settings → Community plugins.

Requires Obsidian 1.5.0 or newer, desktop only. The feature is a modifier plus a digit; there is no touch equivalent, so the plugin is not offered on mobile. Popout windows work.

## Settings

| Setting | Default | Notes |
| --- | --- | --- |
| Auto match | on | Watches the result list, not the input. |
| When a match is found | highlight only | Confirm selection is limited to exact and normalized matches. |
| Idle delay | 1000 ms | Range 200-5000 ms. |
| Minimum match strength | contains | `exact` → `normalized` → `prefix` → `contains` → `fuzzy`. |
| Several equally good matches | do nothing | Or take the first / last, or never act. |
| Modifier key | Mod (Cmd / Ctrl) | Alt is unreliable on Windows. |
| Scenes | all on | Per-surface switches. Disabled scenes behave exactly like stock Obsidian. |

`Mod` means Cmd on macOS and Ctrl elsewhere.

## Privacy

SnapTo runs entirely on your machine. It sends nothing anywhere, has no telemetry, does not scan the vault, and writes only its own settings to `data.json`.

## Development

```bash
npm install
npm run dev        # watch build
npm run verify     # typecheck + test + lint + build
npm run sync "D:/MyNotes/Test"   # copy build output into a vault
```

`npm run verify` is the gate before every commit. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the layout and the debugging workflow.

## Credits

The approach of binding number keys to a surface's own keymap scope was learned from [Quick Select](https://github.com/itsonlyjames/obsidian-quick-select) (MIT). No code was copied; the design notes are in [docs/TECHNICAL_DECISIONS.md](docs/TECHNICAL_DECISIONS.md).

## License

MIT
