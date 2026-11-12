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

/** Stand-ins for the two classes the plugin wraps. */
export class SuggestModal {
  open(): void {
    // Obsidian creates the prompt DOM here.
  }
  close(): void {}
}

export class PopoverSuggest {
  open(): void {}
  close(): void {}
}

export class Modal {
  open(): void {}
  close(): void {}
}
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
