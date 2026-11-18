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
    prune: () => this.pruneDead(),
    onBind: (context) => this.reconcile(context),
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

  /** Settings synced from another device: reload, then bring open surfaces along. */
  async onExternalSettingsChange(): Promise<void> {
    await this.loadSettings();
    this.onSettingsChanged();
  }

  onSettingsChanged(): void {
    // Reconcile must not resurrect a surface whose container is already gone:
    // its keymap scope is popped, so registering handlers on it is wasted work
    // that also inflates the counts used by tests and the runtime check.
    this.pruneDead();
    this.tracker?.setModifier(this.settings.modifier);
    for (const context of this.contexts.all()) this.reconcile(context);
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

  private isSceneEnabled(context: SuggestionContext): boolean {
    return this.settings.scenes[context.scene]?.enabled === true;
  }

  private buildConfig(context: SuggestionContext): AutoMatchConfig | null {
    if (!this.settings.autoMatchEnabled) return null;
    if (!this.isSceneEnabled(context)) return null;
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
   * Bring one live surface in line with current settings.
   *
   * Every path that can change state — first attach, repeat open, settings
   * change, external sync — ends here. Keeping the three effects together is
   * what makes them impossible to leave half-applied: there is no "remember to
   * re-enable the watcher" branch to forget.
   *
   * Idempotent: `ShortcutManager.sync` compares a signature, `AutoMatchManager.watch`
   * returns when a watcher exists, and badge rendering rewrites the same nodes.
   */
  private reconcile(context: SuggestionContext): void {
    this.tracker?.attachDocument(context.containerEl.ownerDocument);
    this.syncContext(context);
    this.refreshBadges(context);
    this.autoMatch?.watch(context);
  }

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

  /**
   * Whether the number shortcuts are available on this surface.
   *
   * The badge numbers and the number keys are one feature, so they answer the
   * same question. They used to answer different ones — the shortcut toggle
   * had no say over the badges — which meant turning "Enable number
   * shortcuts" off left the digits on screen, pointing at keys that no
   * longer did anything.
   */
  private shortcutsEnabled(context: SuggestionContext): boolean {
    return this.settings.quickSelectEnabled && this.isSceneEnabled(context);
  }

  private syncContext(context: SuggestionContext): void {
    this.shortcuts.sync(context, {
      // A disabled scene must lose its keys even while quick select stays on.
      enabled: this.shortcutsEnabled(context),
      modifier: this.settings.modifier,
      maxIndex: MAX_SHORTCUTS,
      scene: context.scene,
    });
  }

  private refreshBadges(context: SuggestionContext): void {
    if (this.settings.showBadges && this.shortcutsEnabled(context)) {
      this.badges.apply(context, this.settings.badgeStyle === "always");
    } else {
      this.badges.clear(context);
    }
  }

  /**
   * Newest live context whose scene is enabled.
   *
   * Contexts of disabled scenes stay in the registry on purpose: removing them
   * would mean the surface cannot come back until it is reopened, and a modal
   * does not reopen on its own. They are filtered here instead, so a disabled
   * scene cannot feed commands, `match-now` or the navigation tracker.
   */
  private activeEnabledContext(): SuggestionContext | null {
    const ordered = this.contexts.all();
    for (let i = ordered.length - 1; i >= 0; i -= 1) {
      const context = ordered[i];
      if (!context || !context.isAlive()) continue;
      if (!this.isSceneEnabled(context)) continue;
      // A surface showing "no results" cannot answer a command, and it must not
      // shadow a usable surface below it.
      if (context.getCandidates().length === 0) continue;
      return context;
    }
    return null;
  }

  /** Arrow keys inside a list mean "I am choosing", so auto match backs off. */
  private noteNavigation(): void {
    this.activeEnabledContext()?.noteManualNavigation();
  }

  // ---------------------------------------------------------------- commands

  private registerCommands(): void {
    this.addCommand({
      id: "match-now",
      name: t("cmdMatchNow"),
      callback: () => {
        const active = this.activeEnabledContext();
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
        // Same path as the settings page, so live surfaces follow immediately.
        this.onSettingsChanged();
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
          const active = this.activeEnabledContext();
          if (!active) return false;
          const candidates = active.getCandidates();
          if (index >= candidates.length) return false;
          if (checking) return true;
          const target = candidates[index];
          // The command carries no key event of its own, so the host's last
          // event is the closest thing to the modifier the user is holding.
          if (target) active.commit(target.index, this.lastUserEvent());
          return true;
        },
      });
    }
  }

  /**
   * The last event Obsidian saw, when it is a keyboard event.
   *
   * `app.lastEvent` is how the host itself remembers modifiers for actions
   * that were not triggered by a key press. The check is by shape rather than
   * `instanceof`, because an event from a popout window belongs to another
   * realm and would fail that test.
   */
  private lastUserEvent(): Event | undefined {
    const last = (this.app as unknown as { lastEvent?: unknown }).lastEvent;
    if (!last || typeof last !== "object") return undefined;
    const type = (last as { type?: unknown }).type;
    if (type !== "keydown" && type !== "keyup") return undefined;
    return last as Event;
  }

  private log(message: string, ...rest: unknown[]): void {
    if (!this.settings.debug) return;
    console.debug(`[snapto] ${message}`, ...rest);
  }
}
