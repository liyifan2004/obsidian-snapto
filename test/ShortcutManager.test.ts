import { describe, expect, it, vi } from "vitest";
import { ShortcutManager } from "../src/core/ShortcutManager";
import type { SuggestionContext } from "../src/core/SuggestionContext";
import type { Candidate } from "../src/types";

interface FakeScope {
  handlers: Array<{ modifiers: string[] | null; key: string | null; run: (evt: KeyboardEvent) => unknown }>;
  register(modifiers: string[] | null, key: string | null, run: (evt: KeyboardEvent) => unknown): unknown;
  unregister(handler: unknown): void;
}

function fakeScope(): FakeScope {
  const handlers: FakeScope["handlers"] = [];
  return {
    handlers,
    register(modifiers, key, run) {
      const handler = { modifiers, key, run };
      handlers.push(handler);
      return handler;
    },
    unregister(handler) {
      const index = handlers.indexOf(handler as FakeScope["handlers"][number]);
      if (index >= 0) handlers.splice(index, 1);
    },
  };
}

function fakeContext(candidates: Candidate[], alive = true) {
  const commit = vi.fn();
  const context = {
    id: "ctx",
    scene: "quick-switcher",
    scope: null as unknown,
    isAlive: () => alive,
    getCandidates: () => candidates,
    getSelectedIndex: () => 0,
    commit,
    setSelectedIndex: vi.fn(),
  };
  return { context: context as unknown as SuggestionContext, commit };
}

const candidates: Candidate[] = [
  { index: 0, text: "Alpha", raw: null },
  { index: 1, text: "Beta", raw: null },
  { index: 3, text: "Delta", raw: null },
];

function keyEvent(): KeyboardEvent {
  return { isComposing: false, preventDefault: () => {} } as unknown as KeyboardEvent;
}

describe("ShortcutManager", () => {
  it("registers one handler per number on the context scope", () => {
    const scope = fakeScope();
    const { context } = fakeContext(candidates);
    (context as unknown as { scope: unknown }).scope = scope;

    const manager = new ShortcutManager();
    manager.sync(context, { enabled: true, modifier: "Mod", maxIndex: 9, scene: "quick-switcher" });

    expect(scope.handlers).toHaveLength(9);
    expect(scope.handlers.map((handler) => handler.key)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
    ]);
    expect(scope.handlers[0]?.modifiers).toEqual(["Mod"]);
  });

  it("commits the candidate's real index, not the row position", () => {
    const scope = fakeScope();
    const { context, commit } = fakeContext(candidates);
    (context as unknown as { scope: unknown }).scope = scope;

    const manager = new ShortcutManager();
    manager.sync(context, { enabled: true, modifier: "Mod", maxIndex: 9, scene: "quick-switcher" });

    scope.handlers[2]?.run(keyEvent());
    expect(commit).toHaveBeenCalledWith(3);
  });

  it("falls through when the number exceeds the list", () => {
    const scope = fakeScope();
    const { context, commit } = fakeContext(candidates);
    (context as unknown as { scope: unknown }).scope = scope;

    const manager = new ShortcutManager();
    manager.sync(context, { enabled: true, modifier: "Mod", maxIndex: 9, scene: "quick-switcher" });

    const result = scope.handlers[5]?.run(keyEvent());
    expect(result).toBeUndefined();
    expect(commit).not.toHaveBeenCalled();
  });

  it("ignores keys typed during IME composition", () => {
    const scope = fakeScope();
    const { context, commit } = fakeContext(candidates);
    (context as unknown as { scope: unknown }).scope = scope;

    const manager = new ShortcutManager();
    manager.sync(context, { enabled: true, modifier: "Mod", maxIndex: 9, scene: "quick-switcher" });

    scope.handlers[0]?.run({ isComposing: true } as KeyboardEvent);
    expect(commit).not.toHaveBeenCalled();
  });

  it("does not act on a context that already closed", () => {
    const scope = fakeScope();
    const { context, commit } = fakeContext(candidates, false);
    (context as unknown as { scope: unknown }).scope = scope;

    const manager = new ShortcutManager();
    manager.sync(context, { enabled: true, modifier: "Mod", maxIndex: 9, scene: "quick-switcher" });

    scope.handlers[0]?.run(keyEvent());
    expect(commit).not.toHaveBeenCalled();
  });

  it("registers nothing when the feature is off", () => {
    const scope = fakeScope();
    const { context } = fakeContext(candidates);
    (context as unknown as { scope: unknown }).scope = scope;

    const manager = new ShortcutManager();
    manager.sync(context, { enabled: false, modifier: "Mod", maxIndex: 9, scene: "quick-switcher" });

    expect(scope.handlers).toHaveLength(0);
    expect(manager.count()).toBe(0);
  });

  it("re-registers when the modifier changes and drops the old handlers", () => {
    const scope = fakeScope();
    const { context } = fakeContext(candidates);
    (context as unknown as { scope: unknown }).scope = scope;

    const manager = new ShortcutManager();
    manager.sync(context, { enabled: true, modifier: "Mod", maxIndex: 9, scene: "quick-switcher" });
    manager.sync(context, { enabled: true, modifier: "Alt", maxIndex: 9, scene: "quick-switcher" });

    expect(scope.handlers).toHaveLength(9);
    expect(scope.handlers[0]?.modifiers).toEqual(["Alt"]);
    expect(manager.count()).toBe(1);
  });

  it("is a no-op when the scope is missing", () => {
    const { context } = fakeContext(candidates);
    const manager = new ShortcutManager();

    expect(() =>
      manager.sync(context, { enabled: true, modifier: "Mod", maxIndex: 9, scene: "quick-switcher" }),
    ).not.toThrow();
    expect(manager.count()).toBe(0);
  });

  it("removes all handlers on clear", () => {
    const scope = fakeScope();
    const { context } = fakeContext(candidates);
    (context as unknown as { scope: unknown }).scope = scope;

    const manager = new ShortcutManager();
    manager.sync(context, { enabled: true, modifier: "Mod", maxIndex: 9, scene: "quick-switcher" });
    manager.clear();

    expect(scope.handlers).toHaveLength(0);
  });
});
