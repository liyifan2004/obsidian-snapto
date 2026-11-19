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
    // The host keeps the selection; the fake has to as well, or a test
    // cannot tell whether the highlight actually moved.
    setSelectedItem: vi.fn((index: number) => {
      list.selectedItem = index;
    }),
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

  it("backs off while the user is choosing by hand", async () => {
    const { plugin, internals } = await boot();
    active = plugin;
    const host = makeHost(["Alpha", "Beta"]);
    host.modal.open();

    const input = (host.modal as unknown as { inputEl: HTMLInputElement }).inputEl;
    input.value = "Beta";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    const context = internals.contexts.all()[0];
    expect(internals.autoMatch.runNow(context!)).toBe(true);
    expect(context?.getSelectedIndex()).toBe(1);

    // The user presses an arrow key and moves the highlight themselves.
    // The plugin must not fight them for the next moment: this is the
    // behaviour that stops auto match from stealing the selection while
    // someone is scrolling through the list.
    context?.noteManualNavigation();
    context?.setSelectedIndex(0);
    expect(context?.getSelectedIndex()).toBe(0);

    expect(internals.autoMatch.runNow(context!)).toBe(false);
    expect(context?.getSelectedIndex()).toBe(0);
  });

  it("follows the number display setting without touching the scene", async () => {
    const { plugin, internals } = await boot();
    active = plugin;
    const host = makeHost(["Alpha"]);
    host.modal.open();
    expect(internals.shortcuts.count()).toBe(1);

    internals.settings.numberDisplay = "off";
    internals.onSettingsChanged();
    expect(internals.shortcuts.count()).toBe(0);

    internals.settings.numberDisplay = "on-modifier";
    internals.onSettingsChanged();
    expect(internals.shortcuts.count()).toBe(1);
  });

  it("removes the badges when the number shortcuts are turned off", async () => {
    const { plugin, internals } = await boot();
    active = plugin;
    const host = makeHost(["Alpha", "Beta"]);
    host.modal.open();
    expect(badgeCount(host)).toBe(2);

    // The digits and the number keys are one feature. Turning the keys off
    // must not leave digits pointing at keys that no longer work.
    internals.settings.numberDisplay = "off";
    internals.onSettingsChanged();
    expect(internals.shortcuts.count()).toBe(0);
    expect(badgeCount(host)).toBe(0);

    internals.settings.numberDisplay = "on-modifier";
    internals.onSettingsChanged();
    expect(badgeCount(host)).toBe(2);
  });

  it("keeps the keys working without drawing any digits", async () => {
    const { plugin, internals } = await boot();
    active = plugin;
    const host = makeHost(["Alpha", "Beta"]);
    host.modal.open();

    // "Keys only" is the one combination the old settings could not express:
    // the keys work and no digit is drawn.
    internals.settings.numberDisplay = "keys-only";
    internals.onSettingsChanged();
    expect(internals.shortcuts.count()).toBe(1);
    expect(badgeCount(host)).toBe(0);

    internals.settings.numberDisplay = "always";
    internals.onSettingsChanged();
    expect(internals.shortcuts.count()).toBe(1);
    expect(badgeCount(host)).toBe(2);
  });

  it("keeps a disabled scene disabled when its list goes empty", async () => {
    const { plugin, internals } = await boot();
    active = plugin;
    const host = makeHost(["Alpha", "Beta"]);
    host.modal.open();

    internals.settings.scenes["quick-switcher"].enabled = false;
    internals.onSettingsChanged();
    expect(internals.shortcuts.count()).toBe(0);

    // The list empties. The host renders a "press Enter to create" row whose
    // value is null, so the surface can no longer be classified — it must
    // keep the scene it had, not fall back to another one.
    host.values.length = 0;
    (host.list as { values?: unknown[] }).values = [null];

    internals.onSettingsChanged();

    const context = internals.contexts.all()[0];
    expect(context?.scene).toBe("quick-switcher");
    expect(internals.shortcuts.count()).toBe(0);
    expect(badgeCount(host)).toBe(0);
  });

  it("does not number the create-new-file placeholder", async () => {
    const { plugin, internals } = await boot();
    active = plugin;
    const host = makeHost(["Alpha"]);
    host.modal.open();
    expect(badgeCount(host)).toBe(1);

    // Swap the list for the placeholder Obsidian renders on no match.
    host.container.textContent = "";
    const row = host.container.createEl("div", { cls: "suggestion-item" });
    const content = row.createEl("div", { cls: "suggestion-content" });
    content.createEl("div", { cls: "suggestion-title", text: "zzz-nothing" });
    row.createEl("div", { cls: "suggestion-aux" }).appendChild(
      createSpan({ cls: "suggestion-action", text: "press Enter to create" }),
    );
    (host.list as { values?: unknown[] }).values = [null];

    const context = internals.contexts.all()[0];
    expect(context?.getCandidates()).toHaveLength(0);
  });

  it("numbers the same rows the number keys pick", async () => {
    const { plugin, internals } = await boot();
    active = plugin;
    const host = makeHost(["Alpha", "Beta"]);
    host.modal.open();

    // The badge on a row has to be the row that `Ctrl+N` opens. The two used
    // to be filtered differently — the badges by DOM class, the candidates by
    // the value's type — and could disagree on the same list.
    const context = internals.contexts.all()[0];
    const selectable = context?.getSelectableRows() ?? [];
    const badges = Array.from(host.container.querySelectorAll(".snapto-index"));

    expect(badges).toHaveLength(selectable.length);
    for (let i = 0; i < selectable.length; i += 1) {
      const row = selectable[i]?.row;
      expect(row?.querySelector(".snapto-index")?.textContent).toBe(String(i + 1));
    }

    // And the candidate at the same position is the one the badge names.
    const candidates = context?.getCandidates() ?? [];
    for (let i = 0; i < candidates.length; i += 1) {
      expect(candidates[i]?.index).toBe(selectable[i]?.index);
    }
  });

  it("keeps the badge and the shortcut on the same row when a heading lies", async () => {
    const { plugin, internals } = await boot();
    active = plugin;
    const host = makeHost(["Alpha", "Beta"]);

    // A row the host marked as a heading, whose value does not say so.
    // The badge renderer filtered on the class, the candidate list on the
    // value's type, so the digit "1" sat on "Alpha" while `Ctrl+1` opened
    // the heading.
    const heading = host.container.createEl("div", {
      cls: "suggestion-item mod-group",
    });
    heading.setText("Recent");
    host.container.insertBefore(heading, host.container.firstChild);
    host.values.unshift({ name: "Recent" });

    host.modal.open();

    const context = internals.contexts.all()[0];
    const candidates = context?.getCandidates() ?? [];
    const badges = Array.from(host.container.querySelectorAll(".snapto-index"));

    // The heading is not a result, so it gets no number and is not a
    // candidate. "Alpha" is both the first badge and the first candidate.
    expect(candidates.map((candidate) => candidate.text)).toEqual(["Alpha", "Beta"]);
    expect(badges).toHaveLength(2);
    expect(badges[0]?.parentElement?.textContent).toContain("Alpha");
    expect(candidates[0]?.text).toBe("Alpha");
  });

  it("numbers the row the first candidate points at", async () => {
    const { plugin, internals } = await boot();
    active = plugin;
    const host = makeHost(["Alpha"]);

    // A heading row whose value carries a type other than "group" — the
    // search suggester pushes "property-key" entries next to "group"
    // headings. Old code put the badge "1" on "Alpha" while the first
    // candidate was the heading, so `Ctrl+1` opened something else.
    const heading = host.container.createEl("div", { cls: "suggestion-item mod-group" });
    heading.setText("Recent");
    host.container.insertBefore(heading, host.container.firstChild);
    host.values.unshift({ type: "property-key", name: "Recent" });

    host.modal.open();

    const context = internals.contexts.all()[0];
    const candidates = context?.getCandidates() ?? [];
    const badges = Array.from(host.container.querySelectorAll(".snapto-index"));

    expect(candidates[0]?.text).toBe("Alpha");
    expect(badges).toHaveLength(1);
    expect(badges[0]?.parentElement?.textContent).toContain("Alpha");
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
