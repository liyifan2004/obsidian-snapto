import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import { t } from "../i18n";
import type { MatchLevel, SceneId } from "../types";
import {
  DELAY_MAX_MS,
  DELAY_MIN_MS,
  SCENE_IDS,
  type AutoMatchAction,
  type ConflictPolicy,
  type ModifierKey,
  type SnapToSettings,
} from "./DefaultSettings";

export interface SettingsHost {
  settings: SnapToSettings;
  saveSettings(): Promise<void>;
  /** Called after a change that needs live surfaces re-synced. */
  onSettingsChanged(): void;
}

const LEVEL_LABELS: Array<{ value: MatchLevel; label: () => string }> = [
  { value: "exact", label: () => t("levelExact") },
  { value: "normalized", label: () => t("levelNormalized") },
  { value: "prefix", label: () => t("levelPrefix") },
  { value: "contains", label: () => t("levelContains") },
  { value: "fuzzy", label: () => t("levelFuzzy") },
];

/** Scene captions live here so the settings page owns its own vocabulary. */
function sceneLabels(scene: SceneId): { name: string; desc: string } {
  switch (scene) {
    case "quick-switcher":
      return { name: t("sceneQuickSwitcher"), desc: t("sceneQuickSwitcherDesc") };
    case "command-palette":
      return { name: t("sceneCommandPalette"), desc: t("sceneCommandPaletteDesc") };
    case "plugin-modal":
      return { name: t("scenePluginModal"), desc: t("scenePluginModalDesc") };
    case "editor-suggest":
      return { name: t("sceneEditorSuggest"), desc: t("sceneEditorSuggestDesc") };
    default:
      return { name: t("scenePopoverSuggest"), desc: t("scenePopoverSuggestDesc") };
  }
}

export class SnapToSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly host: Plugin & SettingsHost,
  ) {
    super(app, host);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.renderGeneral(containerEl);
    this.renderQuickSelect(containerEl);
    this.renderScenes(containerEl);
    this.renderMatching(containerEl);
    this.renderTroubleshooting(containerEl);
  }

  /** Persist + fan out. Every control goes through here so nothing is dead. */
  private commit(mutate: (settings: SnapToSettings) => void): void {
    mutate(this.host.settings);
    this.host.onSettingsChanged();
    void this.host.saveSettings();
  }

  private renderGeneral(containerEl: HTMLElement): void {
    new Setting(containerEl).setName(t("headingGeneral")).setHeading();

    new Setting(containerEl)
      .setName(t("autoMatchName"))
      .setDesc(t("autoMatchDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.host.settings.autoMatchEnabled).onChange((value) => {
          this.commit((settings) => {
            settings.autoMatchEnabled = value;
          });
          this.display();
        }),
      );

    new Setting(containerEl)
      .setName(t("autoMatchActionName"))
      .setDesc(t("autoMatchActionDesc"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("highlight", t("autoMatchHighlight"))
          .addOption("confirm", t("autoMatchConfirm"))
          .setValue(this.host.settings.autoMatchAction)
          .onChange((value) => {
            this.commit((settings) => {
              settings.autoMatchAction = value as AutoMatchAction;
            });
          }),
      );

    new Setting(containerEl)
      .setName(t("delayName"))
      .setDesc(t("delayDesc"))
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = String(DELAY_MIN_MS);
        text.inputEl.max = String(DELAY_MAX_MS);
        text.inputEl.step = "100";
        text.setValue(String(this.host.settings.delayMs)).onChange((value) => {
          const parsed = Number.parseInt(value, 10);
          if (!Number.isFinite(parsed)) return;
          this.commit((settings) => {
            settings.delayMs = Math.min(DELAY_MAX_MS, Math.max(DELAY_MIN_MS, parsed));
          });
        });
      });

    new Setting(containerEl)
      .setName(t("matchLevelName"))
      .setDesc(t("matchLevelDesc"))
      .addDropdown((dropdown) => {
        for (const entry of LEVEL_LABELS) dropdown.addOption(entry.value, entry.label());
        dropdown.setValue(this.host.settings.matchLevel).onChange((value) => {
          this.commit((settings) => {
            settings.matchLevel = value as MatchLevel;
          });
        });
      });

    new Setting(containerEl)
      .setName(t("conflictName"))
      .setDesc(t("conflictDesc"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("unique", t("conflictUnique"))
          .addOption("first", t("conflictFirst"))
          .addOption("last", t("conflictLast"))
          .addOption("none", t("conflictNone"))
          .setValue(this.host.settings.conflictPolicy)
          .onChange((value) => {
            this.commit((settings) => {
              settings.conflictPolicy = value as ConflictPolicy;
            });
          }),
      );
  }

  private renderQuickSelect(containerEl: HTMLElement): void {
    new Setting(containerEl).setName(t("headingQuickSelect")).setHeading();

    // One control for the whole feature. The digits and the keys are the
    // same thing seen from two sides, and separate switches could promise a
    // key that did nothing.
    new Setting(containerEl)
      .setName(t("numberDisplayName"))
      .setDesc(t("numberDisplayDesc"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("off", t("numberDisplayOff"))
          .addOption("on-modifier", t("numberDisplayOnModifier"))
          .addOption("always", t("numberDisplayAlways"))
          .addOption("keys-only", t("numberDisplayKeysOnly"))
          .setValue(this.host.settings.numberDisplay)
          .onChange((value) => {
            this.commit((settings) => {
              settings.numberDisplay = value as SnapToSettings["numberDisplay"];
            });
            this.display();
          }),
      );

    new Setting(containerEl)
      .setName(t("modifierName"))
      .setDesc(t("modifierDesc"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("Mod", t("modifierMod"))
          .addOption("Ctrl", t("modifierCtrl"))
          .addOption("Alt", t("modifierAlt"))
          .addOption("Meta", t("modifierMeta"))
          .setValue(this.host.settings.modifier)
          .onChange((value) => {
            this.commit((settings) => {
              settings.modifier = value as ModifierKey;
            });
          }),
      );
  }

  private renderScenes(containerEl: HTMLElement): void {
    new Setting(containerEl).setName(t("headingScenes")).setHeading();

    for (const scene of SCENE_IDS) {
      const labels = sceneLabels(scene);
      new Setting(containerEl)
        .setName(labels.name)
        .setDesc(labels.desc)
        .addToggle((toggle) =>
          toggle.setValue(this.host.settings.scenes[scene].enabled).onChange((value) => {
            this.commit((settings) => {
              settings.scenes[scene].enabled = value;
            });
          }),
        );
    }
  }

  private renderMatching(containerEl: HTMLElement): void {
    new Setting(containerEl).setName(t("headingMatching")).setHeading();

    new Setting(containerEl)
      .setName(t("normalizeWidthName"))
      .setDesc(t("normalizeWidthDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.host.settings.normalizeWidth).onChange((value) => {
          this.commit((settings) => {
            settings.normalizeWidth = value;
          });
        }),
      );

    new Setting(containerEl)
      .setName(t("ignoreCaseName"))
      .setDesc(t("ignoreCaseDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.host.settings.ignoreCase).onChange((value) => {
          this.commit((settings) => {
            settings.ignoreCase = value;
          });
        }),
      );

    new Setting(containerEl)
      .setName(t("ignoreSeparatorsName"))
      .setDesc(t("ignoreSeparatorsDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.host.settings.ignoreSeparators).onChange((value) => {
          this.commit((settings) => {
            settings.ignoreSeparators = value;
          });
        }),
      );
  }

  private renderTroubleshooting(containerEl: HTMLElement): void {
    new Setting(containerEl).setName(t("headingAdvanced")).setHeading();

    new Setting(containerEl)
      .setName(t("debugName"))
      .setDesc(t("debugDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.host.settings.debug).onChange((value) => {
          this.commit((settings) => {
            settings.debug = value;
          });
        }),
      );
  }
}
