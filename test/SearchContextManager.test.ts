import { describe, expect, it, vi } from "vitest";
import { SearchContextManager } from "../src/core/SearchContextManager";
import type { SuggestionContext } from "../src/core/SuggestionContext";

function fakeContext(id: string, scene: SuggestionContext["scene"] = "plugin-modal") {
  const state = { alive: true };
  const context = {
    id,
    scene,
    isAlive: () => state.alive,
    getCandidates: () => [],
    getSelectedIndex: () => 0,
    commit: vi.fn(),
    setSelectedIndex: vi.fn(),
  };
  return { context: context as unknown as SuggestionContext, state };
}

const ids = (manager: SearchContextManager) => manager.all().map((context) => context.id);

describe("SearchContextManager", () => {
  it("keeps contexts newest-last", () => {
    const manager = new SearchContextManager();
    manager.add(fakeContext("a").context);
    manager.add(fakeContext("b").context);

    expect(ids(manager)).toEqual(["a", "b"]);
  });

  it("moves a touched context to the end", () => {
    const manager = new SearchContextManager();
    manager.add(fakeContext("a").context);
    manager.add(fakeContext("b").context);

    manager.touch("a");

    expect(ids(manager)).toEqual(["b", "a"]);
  });

  it("reports dead contexts as-is; liveness is the caller's filter", () => {
    const manager = new SearchContextManager();
    const a = fakeContext("a");
    const b = fakeContext("b");
    manager.add(a.context);
    manager.add(b.context);

    b.state.alive = false;

    // The registry does not hide anything: picking a context depends on scene
    // settings it knows nothing about.
    expect(ids(manager)).toEqual(["a", "b"]);
    expect(manager.all()[1]?.isAlive()).toBe(false);
  });

  it("finds a live context by host, skipping closed ones", () => {
    const manager = new SearchContextManager();
    const host = {};
    const first = fakeContext("first");
    manager.add({ ...first.context, host } as unknown as SuggestionContext);

    expect(manager.findByHost(host)?.id).toBe("first");

    first.state.alive = false;
    expect(manager.findByHost(host)).toBeNull();
  });

  it("ignores removal of unknown ids", () => {
    const manager = new SearchContextManager();
    expect(() => manager.remove("missing")).not.toThrow();
  });

  it("clears everything on clear", () => {
    const manager = new SearchContextManager();
    manager.add(fakeContext("a").context);
    manager.clear();

    expect(manager.size()).toBe(0);
    expect(ids(manager)).toEqual([]);
  });
});
