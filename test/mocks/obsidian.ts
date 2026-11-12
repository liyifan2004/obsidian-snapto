/**
 * Minimal stand-in for the `obsidian` module during unit tests.
 *
 * Only what the modules under test touch at runtime is provided. The core
 * matcher, the settings migration and the managers are deliberately free of
 * Obsidian runtime dependencies, so this file stays short on purpose.
 */

export const moment = {
  locale(): string {
    return "en";
  },
};

export class Platform {
  static isMacOS = false;
  static isMobile = false;
}

interface CommandSpec {
  id: string;
  name?: string;
  callback?: () => void;
  checkCallback?: (checking: boolean) => boolean;
}

/**
 * Enough of `Plugin` for `onload()` to run: data access, command and settings
 * registration. The orchestration test drives the real plugin class, so this
 * stand-in has to behave like the base class rather than being a blank.
 */
export class Plugin {
  app: unknown;
  manifest: unknown;
  readonly commands: CommandSpec[] = [];
  readonly settingTabs: unknown[] = [];
  private data: unknown = null;

  constructor(app?: unknown, manifest?: unknown) {
    this.app = app;
    this.manifest = manifest;
  }

  async loadData(): Promise<unknown> {
    // Obsidian round-trips through disk, so tests must not share the object.
    return this.data === null ? null : structuredClone(this.data);
  }

  async saveData(data: unknown): Promise<void> {
    this.data = structuredClone(data);
  }

  addCommand(spec: CommandSpec): CommandSpec {
    this.commands.push(spec);
    return spec;
  }

  addSettingTab(tab: unknown): void {
    this.settingTabs.push(tab);
  }
}

/**
 * Stand-ins that mirror the real hierarchy: `SuggestModal` and `PopoverSuggest`
 * do not own `open` themselves, they inherit it — which is exactly why patching
 * the subclass prototype is safe for every other `Modal` user.
 */
export class Modal {
  openCount = 0;
  closeCount = 0;

  open(): void {
    this.openCount += 1;
  }

  close(): void {
    this.closeCount += 1;
  }
}

export class SuggestModal extends Modal {}
export class PopoverSuggest extends Modal {}
export class PluginSettingTab {
  app: unknown;
  plugin: unknown;
  containerEl: HTMLElement;

  constructor(app: unknown, plugin: unknown) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = document.createElement("div");
  }

  display(): void {}
}
export class Notice {
  constructor(_message: string) {}
}
export class Setting {}
export class Component {}
export class Scope {}

export function createEl<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] {
  return document.createElement(tag);
}
