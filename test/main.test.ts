import { afterEach, describe, expect, it, vi } from "vitest";
import SnapToPlugin from "../src/main";
import type { AutoMatchManager } from "../src/core/AutoMatchManager";
import type { SearchContextManager } from "../src/core/SearchContextManager";
import type { ShortcutManager } from "../src/core/ShortcutManager";
import type { SurfaceBinder } from "../src/core/SurfaceBinder";
import type { SnapToSettings } from "../src/settings/DefaultSettings";
import type { SuggestionListLike } from "../src/core/SuggestionContext";
import { SuggestModal } from "./mocks/obsidian";

/**
 * Orchestration tests: the real plugin class, the real managers, a fake host.
 *
 * Everything else in `test/` exercises one module. The state bugs of 0.1.1 —
 * a disabled scene coming back on the next keystroke, commands ignoring the
 * scene switch — lived in `main.ts`, which had no test at all.
 */

interface Internals {
  contexts: SearchContextManager;
  shortcuts: ShortcutManager;
  autoMatch: AutoMatchManager;
  binder: SurfaceBinder;
  settings: SnapToSettings;
  onSettingsChanged(): void;
  pruneDead(): void;
}

interface FakeHandler {
  modifiers: string[] | null;
  key: string | null;
}

interface FakeScope {
  handlers: FakeHandler[];
  register(modifiers: string[] | null, key: string | null, fn: unknown): unknown;
  unregister(handler: unknown): void;
}

interface Host {
  modal: SuggestModal;
  list: SuggestionListLike;
  container: HTMLElement;
  scope: FakeScope;
  values: unknown[];
  committed: number[];
}

function fakeScope(): FakeScope {
  const handlers: FakeHandler[] = [];
  return {
    handlers,
    register(modifiers, key) {
      const handler: FakeHandler = { modifiers, key };
      handlers.push(handler);
      return handler;
    },
    unregister(handler) {
      const index = handlers.indexOf(handler as FakeHandler);
      if (index >= 0) handlers.splice(index, 1);
    },
  };
}

function makeHost(titles: string[], kind: "file" | "generic" = "file"): Host {
  const container = createEl("div", { cls: "prompt-results" });
  document.body.appendChild(container);

  const values: unknown[] = [];
  for (const title of titles) {
    const row = container.createEl("div", { cls: "suggestion-item" });
    const content = row.createEl("div", { cls: "suggestion-content" });
    content.createEl("div", { cls: "suggestion-title", text: title });
    // File-like lands on "quick-switcher"; anything else on "plugin-modal".
    values.push(kind === "file" ? { path: `notes/${title}.md`, basename: title } : { name: title });
  }

  const committed: number[] = [];
  const list: SuggestionListLike = {
    values,
    selectedItem: 0,
    containerEl: container,
    setSelectedItem: vi.fn(),
    useSelectedItem: vi.fn(() => {
      committed.push(1);
      return true;
    }),
  };

  const scope = fakeScope();
  const modal = new SuggestModal();
  const target = modal as unknown as Record<string, unknown>;
  target.chooser = list;
  target.resultContainerEl = container;
  target.inputEl = createEl("input");
  target.scope = scope;

  return { modal, list, container, scope, values, committed };
}

async function boot(): Promise<{ plugin: SnapToPlugin; internals: Internals }> {
  const plugin = new SnapToPlugin({} as never, { id: "snapto" } as never);
  await plugin.onload();
  return { plugin, internals: plugin as unknown as Internals };
}

function badgeCount(host: Host): number {
  return host.container.querySelectorAll(".snapto-index").length;
}

function command(internals: Internals, id: string) {
  const owner = internals as unknown as { commands: Array<Record<string, unknown>> };
  const found = owner.commands.find((entry) => entry.id === id);
  if (!found) throw new Error(`command not registered: ${id}`);
  return found as {
    callback?: () => void;
    checkCallback?: (checking: boolean) => boolean;
  };
}

let active: SnapToPlugin | null = null;

afterEach(() => {
  active?.onunload();
  active = null;
  document.body.textContent = "";
});

describe("plugin orchestration", () => {
  it("keeps a disabled scene disabled on the next open", async () => {
    const { plugin, internals } = await boot();
    active = plugin;
    const host = makeHost(["Alpha", "Beta"]);

    host.modal.open();
    expect(internals.shortcuts.count()).toBe(1);
    expect(badgeCount(host)).toBe(2);

    internals.settings.scenes["quick-switcher"].enabled = false;
    internals.onSettingsChanged();
    expect(internals.shortcuts.count()).toBe(0);
    expect(badgeCount(host)).toBe(0);

    // The next keystroke in a popover, or a reopen, goes through bind again.
    host.modal.open();

    expect(internals.shortcuts.count()).toBe(0);
    expect(badgeCount(host)).toBe(0);
  });

  it("restores shortcuts, badges and the watcher when the scene comes back", async () => {
    const { plugin, internals } = await boot();
    active = plugin;
    const host = makeHost(["Alpha", "Beta"]);

    host.modal.open();
    expect(internals.autoMatch.count()).toBe(1);

    internals.settings.scenes["quick-switcher"].enabled = false;
    internals.onSettingsChanged();
    expect(internals.shortcuts.count()).toBe(0);

    internals.settings.scenes["quick-switcher"].enabled = true;
    internals.onSettingsChanged();

    expect(internals.shortcuts.count()).toBe(1);
    expect(badgeCount(host)).toBe(2);
    expect(internals.autoMatch.count()).toBe(1);
  });

  it("refuses number commands while the scene is off", async () => {
    const { plugin, internals } = await boot();
    active = plugin;
    const host = makeHost(["Alpha", "Beta"]);
    host.modal.open();

    expect(command(internals, "select-result-1").checkCallback?.(false)).toBe(true);

    internals.settings.scenes["quick-switcher"].enabled = false;
    internals.onSettingsChanged();

    expect(command(internals, "select-result-1").checkCallback?.(false)).toBe(false);
    expect(command(internals, "select-result-1").checkCallback?.(true)).toBe(false);
  });

  it("does not commit from match-now while the scene is off", async () => {
    const { plugin, internals } = await boot();
    active = plugin;
    const host = makeHost(["Alpha", "Beta"]);
    host.modal.open();

    const input = (host.modal as unknown as { inputEl: HTMLInputElement }).inputEl;
    input.value = "Alpha";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    internals.settings.scenes["quick-switcher"].enabled = false;
    internals.onSettingsChanged();

    command(internals, "match-now").callback?.();

    expect(host.committed).toHaveLength(0);
  });

  it("keeps a surface alive when its list is momentarily empty", async () => {
    const { plugin, internals } = await boot();
    active = plugin;
    const host = makeHost(["Alpha"]);
    host.modal.open();

    const context = internals.contexts.all()[0];
    expect(context).toBeDefined();

    host.values.length = 0;
    (host.list as { values?: unknown[] }).values = [];

    // An empty result set is a normal state, not a dead surface.
    expect(context?.isAlive()).toBe(true);
    expect(internals.contexts.size()).toBe(1);

    host.modal.open();
    expect(internals.contexts.size()).toBe(1);
  });

  it("applies the toggle command to live surfaces without a reload", async () => {
    const { plugin, internals } = await boot();
    active = plugin;
    const host = makeHost(["Alpha", "Beta"]);
    host.modal.open();

    const input = (host.modal as unknown as { inputEl: HTMLInputElement }).inputEl;
    input.value = "Beta";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    const context = internals.contexts.all()[0];
    expect(context).toBeDefined();
    expect(internals.autoMatch.runNow(context!)).toBe(true);

    // Turn auto match off through the command, not through the settings object.
    command(internals, "toggle-auto-match").callback?.();
    expect(internals.settings.autoMatchEnabled).toBe(false);

    // Same live context, no reload: the new setting is in force already.
    expect(internals.autoMatch.runNow(context!)).toBe(false);
  });

  it("follows the quick select toggle without touching the scene", async () => {
    const { plugin, internals } = await boot();
    active = plugin;
    const host = makeHost(["Alpha"]);
    host.modal.open();
    expect(internals.shortcuts.count()).toBe(1);

    internals.settings.quickSelectEnabled = false;
    internals.onSettingsChanged();
    expect(internals.shortcuts.count()).toBe(0);

    internals.settings.quickSelectEnabled = true;
    internals.onSettingsChanged();
    expect(internals.shortcuts.count()).toBe(1);
  });

  it("skips a disabled surface stacked above an enabled one", async () => {
    const { plugin, internals } = await boot();
    active = plugin;

    const enabled = makeHost(["Alpha"], "file");
    enabled.modal.open();

    // Disable the generic modal scene, then stack such a surface on top.
    internals.settings.scenes["plugin-modal"].enabled = false;
    const disabled = makeHost(["Beta"], "generic");
    disabled.modal.open();

    expect(internals.contexts.size()).toBe(2);

    // Commands must reach past the disabled surface to the enabled one.
    expect(command(internals, "select-result-1").checkCallback?.(true)).toBe(true);
    command(internals, "select-result-1").checkCallback?.(false);

    expect(enabled.committed).toHaveLength(1);
    expect(disabled.committed).toHaveLength(0);
  });

  it("skips a surface with no results when choosing where a command goes", async () => {
    const { plugin, internals } = await boot();
    active = plugin;

    const ready = makeHost(["Alpha"]);
    ready.modal.open();

    // A surface that is open but showing "no results" cannot answer anything.
    const empty = makeHost([]);
    empty.modal.open();
    expect(internals.contexts.size()).toBe(2);

    expect(command(internals, "select-result-1").checkCallback?.(true)).toBe(true);
    command(internals, "select-result-1").checkCallback?.(false);

    expect(ready.committed).toHaveLength(1);
    expect(empty.committed).toHaveLength(0);
  });

  it("prunes dead surfaces before reconciling on a settings change", async () => {
    const { plugin, internals } = await boot();
    active = plugin;

    const closed = makeHost(["Alpha"]);
    closed.modal.open();
    closed.container.remove();

    internals.onSettingsChanged();

    // Reconciling a context whose container is gone would register handlers on
    // a keymap scope that has already been popped.
    expect(internals.contexts.size()).toBe(0);
    expect(internals.shortcuts.count()).toBe(0);
  });

  it("reapplies the modifier after settings change elsewhere", async () => {
    const { plugin, internals } = await boot();
    active = plugin;
    const host = makeHost(["Alpha"]);
    host.modal.open();

    expect(host.scope.handlers[0]?.modifiers).toEqual(["Mod"]);

    plugin.settings.modifier = "Alt";
    await plugin.saveSettings();
    // Something else edited data.json: the in-memory copy is stale until reload.
    internals.settings.modifier = "Mod";

    const hook = plugin as unknown as { onExternalSettingsChange?: () => Promise<void> };
    await hook.onExternalSettingsChange?.();

    expect(internals.settings.modifier).toBe("Alt");
    expect(host.scope.handlers[0]?.modifiers).toEqual(["Alt"]);
  });

  it("reloads settings changed outside the app", async () => {
    const { plugin, internals } = await boot();
    active = plugin;
    const host = makeHost(["Alpha"]);
    host.modal.open();

    const pluginWithHook = plugin as unknown as {
      onExternalSettingsChange?: () => Promise<void>;
    };
    expect(typeof pluginWithHook.onExternalSettingsChange).toBe("function");

    await pluginWithHook.onExternalSettingsChange?.();
    expect(internals.settings.scenes["quick-switcher"].enabled).toBe(true);
  });
});
