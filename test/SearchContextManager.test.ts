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

describe("SearchContextManager", () => {
  it("returns the most recently touched context as active", () => {
    const manager = new SearchContextManager();
    const a = fakeContext("a");
    const b = fakeContext("b");

    manager.add(a.context);
    manager.add(b.context);

    expect(manager.active()?.id).toBe("b");

    manager.touch("a");
    expect(manager.active()?.id).toBe("a");
  });

  it("skips dead contexts when resolving the active one", () => {
    const manager = new SearchContextManager();
    const a = fakeContext("a");
    const b = fakeContext("b");
    manager.add(a.context);
    manager.add(b.context);

    b.state.alive = false;

    expect(manager.active()?.id).toBe("a");
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
    expect(manager.active()).toBeNull();
  });
});
