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

export class Plugin {}

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
export class PluginSettingTab {}
export class Notice {
  constructor(_message: string) {}
}
export class Setting {}
export class Component {}
export class Scope {}

export function createEl<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] {
  return document.createElement(tag);
}
