import { Notice, Plugin } from "obsidian";
import { AutoMatchManager, type AutoMatchConfig } from "./core/AutoMatchManager";
import { BadgeRenderer } from "./core/BadgeRenderer";
import { HostPatcher } from "./core/HostPatcher";
import { matchAll } from "./core/MatchEngine";
import { ModifierTracker } from "./core/ModifierTracker";
import { SearchContextManager } from "./core/SearchContextManager";
import { ShortcutManager } from "./core/ShortcutManager";
import { SurfaceBinder } from "./core/SurfaceBinder";
import {
  attachPopoverSuggest,
  attachSuggestModal,
} from "./core/adapters/SuggestionAttacher";
import type { SuggestionContext } from "./core/SuggestionContext";
import { t } from "./i18n";
import { normalizeSettings, type SnapToSettings } from "./settings/DefaultSettings";
import { SnapToSettingTab, type SettingsHost } from "./settings/SettingsTab";
import type { MatchOptions } from "./types";

const MAX_SHORTCUTS = 9;

export default class SnapToPlugin extends Plugin implements SettingsHost {
  settings: SnapToSettings = normalizeSettings(null);

  private readonly contexts = new SearchContextManager();
  private readonly shortcuts = new ShortcutManager();
  private readonly badges = new BadgeRenderer();
  private readonly patcher = new HostPatcher();
  private autoMatch: AutoMatchManager | null = null;
  private tracker: ModifierTracker | null = null;
  private readonly binder = new SurfaceBinder({
    contexts: this.contexts,
    isSceneEnabled: (scene) => this.settings.scenes[scene]?.enabled === true,
    prune: () => this.pruneDead(),
    onAttach: (context) => {
      this.tracker?.attachDocument(context.containerEl.ownerDocument);
      this.syncContext(context);
      this.autoMatch?.watch(context);
      this.refreshBadges(context);
    },
    onReuse: (context) => {
      this.tracker?.attachDocument(context.containerEl.ownerDocument);
      this.syncContext(context);
      this.refreshBadges(context);
    },
    log: (message, ...rest) => this.log(message, ...rest),
  });

  async onload(): Promise<void> {
    await this.loadSettings();

    this.autoMatch = new AutoMatchManager({
      getConfig: (context) => this.buildConfig(context),
      afterListChange: (context) => this.refreshBadges(context),
      log: (message, ...rest) => this.log(message, ...rest),
    });

    this.addSettingTab(new SnapToSettingTab(this.app, this));

    this.patcher.install({
      onModalOpen: (modal) => this.binder.bind(modal, () => attachSuggestModal(modal)),
      onSuggestOpen: (host) => this.binder.bind(host, () => attachPopoverSuggest(host)),
    });

    this.tracker = new ModifierTracker(activeDocument, this.settings.modifier, () =>
      this.noteNavigation(),
    );
    this.tracker.start();

    this.registerCommands();
  }

  onunload(): void {
    this.teardown();
  }

  /**
   * Single exit path. Called both from `onunload` and from the component
   * lifecycle registration, so a reload never leaves a patched prototype or a
   * stray keymap handler behind.
   */
  private teardown(): void {
    this.patcher.uninstall();
    this.autoMatch?.clear();
    this.shortcuts.clear();
    for (const context of this.contexts.all()) this.badges.clear(context);
    this.contexts.clear();
    this.tracker?.stop();
    this.tracker = null;
  }

  // ---------------------------------------------------------------- settings

  async loadSettings(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  onSettingsChanged(): void {
    this.tracker?.setModifier(this.settings.modifier);
    for (const context of this.contexts.all()) this.syncContext(context);
  }

  /** Settings → matcher options, the only place they are derived. */
  private matchOptions(): MatchOptions {
    return {
      minLevel: this.settings.matchLevel,
      normalizeWidth: this.settings.normalizeWidth,
      ignoreCase: this.settings.ignoreCase,
      ignoreSeparators: this.settings.ignoreSeparators,
    };
  }

  private buildConfig(context: SuggestionContext): AutoMatchConfig | null {
    if (!this.settings.autoMatchEnabled) return null;
    if (!this.settings.scenes[context.scene]?.enabled) return null;
    return {
      enabled: true,
      action: this.settings.autoMatchAction,
      delayMs: this.settings.delayMs,
      options: this.matchOptions(),
      policy: this.settings.conflictPolicy,
    };
  }

  // ------------------------------------------------------------------ wiring

  /**
   * Release everything attached to surfaces that already closed.
   *
   * Obsidian pops the keymap scope itself, but our own registries (shortcut
   * count, watchers, badges) would otherwise grow for the whole session.
   */
  private pruneDead(): void {
    for (const context of this.contexts.all()) {
      if (context.isAlive()) continue;
      this.shortcuts.dispose(context.id);
      this.autoMatch?.unwatch(context.id);
      this.badges.clear(context);
      this.contexts.remove(context.id);
    }
  }

  private syncContext(context: SuggestionContext): void {
    this.shortcuts.sync(context, {
      enabled: this.settings.quickSelectEnabled,
      modifier: this.settings.modifier,
      maxIndex: MAX_SHORTCUTS,
    });
  }

  private refreshBadges(context: SuggestionContext): void {
    if (this.settings.showBadges) {
      this.badges.apply(context, this.settings.badgeStyle === "always");
    } else {
      this.badges.clear(context);
    }
  }

  /** Arrow keys inside a list mean "I am choosing", so auto match backs off. */
  private noteNavigation(): void {
    const active = this.contexts.active();
    if (active) active.noteManualNavigation();
  }

  // ---------------------------------------------------------------- commands

  private registerCommands(): void {
    this.addCommand({
      id: "match-now",
      name: t("cmdMatchNow"),
      callback: () => {
        const active = this.contexts.active();
        if (!active) {
          new Notice(t("noticeNoContext"));
          return;
        }
        const matched = this.autoMatch?.runNow(active) ?? false;
        if (!matched) {
          const query = active.getQuery();
          const hits = matchAll(
            active.getCandidates().map((candidate) => candidate.text),
            query,
            this.matchOptions(),
          );
          this.log("manual match", { query, hits: hits.length });
        }
      },
    });

    this.addCommand({
      id: "toggle-auto-match",
      name: t("cmdToggleAutoMatch"),
      callback: () => {
        this.settings.autoMatchEnabled = !this.settings.autoMatchEnabled;
        void this.saveSettings();
        new Notice(
          this.settings.autoMatchEnabled ? t("noticeAutoMatchOn") : t("noticeAutoMatchOff"),
        );
      },
    });

    for (let n = 1; n <= MAX_SHORTCUTS; n += 1) {
      const index = n - 1;
      this.addCommand({
        id: `select-result-${n}`,
        name: t("cmdSelectResult", { n }),
        checkCallback: (checking: boolean) => {
          const active = this.contexts.active();
          if (!active) return false;
          const candidates = active.getCandidates();
          if (index >= candidates.length) return false;
          if (checking) return true;
          const target = candidates[index];
          if (target) active.commit(target.index);
          return true;
        },
      });
    }
  }

  private log(message: string, ...rest: unknown[]): void {
    if (!this.settings.debug) return;
    console.debug(`[snapto] ${message}`, ...rest);
  }
}
