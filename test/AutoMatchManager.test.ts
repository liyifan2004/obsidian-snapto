import { describe, expect, it, vi } from "vitest";
import { AutoMatchManager, type AutoMatchConfig } from "../src/core/AutoMatchManager";
import type { SuggestionContext } from "../src/core/SuggestionContext";
import { DEFAULT_MATCH_OPTIONS } from "../src/core/MatchEngine";

interface Harness {
  context: SuggestionContext;
  committed: number[];
  selected(): number;
  setQuery(query: string): void;
  setManuallyMoved(value: boolean): void;
}

function harness(titles: string[], selected = 0): Harness {
  let query = "";
  let index = selected;
  const committed: number[] = [];
  let manuallyMoved = false;

  const context = {
    id: "ctx",
    scene: "quick-switcher",
    containerEl: document.createElement("div"),
    inputEl: null,
    isAlive: () => true,
    getQuery: () => query,
    getCandidates: () =>
      titles.map((text, i) => ({ index: i, text, raw: text })),
    getSelectedIndex: () => index,
    setSelectedIndex: (next: number) => {
      index = next;
    },
    commit: (next: number) => {
      index = next;
      committed.push(next);
    },
    // The stand-in has to honour `withinMs`, because that argument *is* the
    // grace period: a stub that ignores it would pass no matter how the
    // constant is tuned, and the back-off would have no test guarding it.
    wasManuallyMoved: (withinMs: number) => manuallyMoved && withinMs > 0,
  } as unknown as SuggestionContext;

  return {
    context,
    committed,
    selected: () => index,
    setQuery: (next: string) => {
      query = next;
    },
    setManuallyMoved: (value: boolean) => {
      manuallyMoved = value;
    },
  };
}

function buildManager(config: Partial<AutoMatchConfig> = {}) {
  const full: AutoMatchConfig = {
    enabled: true,
    action: "highlight",
    delayMs: 1000,
    options: DEFAULT_MATCH_OPTIONS,
    policy: "unique",
    ...config,
  };
  const log = vi.fn();
  const manager = new AutoMatchManager({
    getConfig: () => full,
    afterListChange: () => {},
    log,
  });
  return { manager, config: full, log };
}

describe("AutoMatchManager.runNow", () => {
  it("moves the highlight onto a unique prefix hit", () => {
    const h = harness(["Alpha Project", "Beta Review"]);
    h.setQuery("Beta");
    const { manager } = buildManager();

    expect(manager.runNow(h.context)).toBe(true);
    expect(h.selected()).toBe(1);
    expect(h.committed).toHaveLength(0);
  });

  it("does nothing when two candidates tie", () => {
    const h = harness(["Note A", "Note B"]);
    h.setQuery("Note");
    const { manager } = buildManager({ policy: "unique" });

    expect(manager.runNow(h.context)).toBe(false);
    expect(h.selected()).toBe(0);
  });

  it("takes the last tie when asked", () => {
    const h = harness(["Note A", "Note B", "Note C"]);
    h.setQuery("Note");
    const { manager } = buildManager({ policy: "last" });

    expect(manager.runNow(h.context)).toBe(true);
    expect(h.selected()).toBe(2);
  });

  it("stays put when the winner is already selected and only highlighting", () => {
    const h = harness(["Alpha"], 0);
    h.setQuery("Alpha");
    const { manager } = buildManager();

    expect(manager.runNow(h.context)).toBe(false);
    expect(h.committed).toHaveLength(0);
  });

  it("confirms an exact match even when it is already highlighted", () => {
    const h = harness(["Meeting Notes"], 0);
    h.setQuery("Meeting Notes");
    const { manager } = buildManager({ action: "confirm" });

    expect(manager.runNow(h.context)).toBe(true);
    expect(h.committed).toEqual([0]);
  });

  it("refuses to confirm a prefix hit", () => {
    const h = harness(["Meeting Notes"], 0);
    h.setQuery("Meeting");
    const { manager } = buildManager({ action: "confirm" });

    manager.runNow(h.context);
    expect(h.committed).toHaveLength(0);
  });

  it("refuses to confirm a contains hit inside a longer title", () => {
    const h = harness(["会议纪要 2026"], 0);
    h.setQuery("纪要");
    const { manager } = buildManager({ action: "confirm" });

    manager.runNow(h.context);
    expect(h.committed).toHaveLength(0);
  });

  it("confirms a normalized match, ignoring case and width", () => {
    const h = harness(["Daily Note"], 0);
    h.setQuery("daily note");
    const { manager } = buildManager({ action: "confirm" });

    manager.runNow(h.context);
    expect(h.committed).toEqual([0]);
  });

  it("does nothing without a query", () => {
    const h = harness(["Alpha"]);
    const { manager } = buildManager();

    expect(manager.runNow(h.context)).toBe(false);
  });

  it("says nothing when the feature is off", () => {
    const h = harness(["Alpha"]);
    h.setQuery("Alpha");
    const { manager } = buildManager({ enabled: false });

    expect(manager.runNow(h.context)).toBe(false);
  });
});

describe("AutoMatchManager backs off while the user navigates by hand", () => {
  it("does not move the highlight while the user is choosing", () => {
    const h = harness(["Alpha Project", "Beta Review"]);
    h.setQuery("Beta");
    h.setManuallyMoved(true);
    const { manager } = buildManager();

    // The user pressed an arrow key a moment ago: their choice wins.
    expect(manager.runNow(h.context)).toBe(false);
    expect(h.selected()).toBe(0);
  });

  it("does not confirm either", () => {
    const h = harness(["Beta Review"]);
    h.setQuery("Beta Review");
    h.setManuallyMoved(true);
    const { manager } = buildManager({ action: "confirm" });

    expect(manager.runNow(h.context)).toBe(false);
    expect(h.committed).toHaveLength(0);
  });

  it("acts again once the grace period has passed", () => {
    const h = harness(["Alpha Project", "Beta Review"]);
    h.setQuery("Beta");
    h.setManuallyMoved(false);
    const { manager } = buildManager();

    expect(manager.runNow(h.context)).toBe(true);
    expect(h.selected()).toBe(1);
  });
});
