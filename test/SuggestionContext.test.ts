import { beforeEach, describe, expect, it, vi } from "vitest";
import { SuggestionContext, type SuggestionListLike } from "../src/core/SuggestionContext";

/** Build the row markup Obsidian renders for one suggestion. */
function row(title: string, options: { group?: boolean } = {}): HTMLElement {
  const item = createEl("div", { cls: options.group ? "suggestion-item mod-group" : "suggestion-item mod-complex" });
  if (!options.group) {
    const content = createEl("div", { cls: "suggestion-content" });
    content.createEl("div", { cls: "suggestion-title", text: title });
    content.createEl("div", { cls: "suggestion-note", text: "folder/path" });
    item.appendChild(content);
  } else {
    item.setText(title);
  }
  return item;
}

function buildList(entries: Array<{ title: string; group?: boolean }>) {
  const container = createEl("div", { cls: "prompt-results" });
  const values: unknown[] = [];

  for (const entry of entries) {
    container.appendChild(row(entry.title, { group: entry.group }));
    values.push(entry.group ? { type: "group", title: entry.title } : { name: entry.title });
  }

  const list: SuggestionListLike = {
    values,
    selectedItem: 0,
    containerEl: container,
    setSelectedItem: vi.fn(),
    useSelectedItem: vi.fn(() => true),
  };

  return { container, list, values };
}

function makeContext(
  parts: ReturnType<typeof buildList>,
  input?: HTMLInputElement,
): SuggestionContext {
  document.body.appendChild(parts.container);
  return new SuggestionContext({
    id: "test",
    host: {},
    scene: "quick-switcher",
    list: parts.list,
    containerEl: parts.container,
    inputEl: input ?? null,
    scope: {},
    doc: document,
  });
}

describe("SuggestionContext", () => {
  beforeEach(() => {
    document.body.textContent = "";
  });

  it("reads the title, not the path note", () => {
    const parts = buildList([{ title: "Alpha" }]);
    const context = makeContext(parts);

    expect(context.getCandidates()[0]?.text).toBe("Alpha");
  });

  it("skips group headers and keeps the original value index", () => {
    const parts = buildList([
      { title: "Alpha" },
      { title: "Recent", group: true },
      { title: "Beta" },
    ]);
    const context = makeContext(parts);

    const candidates = context.getCandidates();
    expect(candidates.map((candidate) => candidate.text)).toEqual(["Alpha", "Beta"]);
    expect(candidates.map((candidate) => candidate.index)).toEqual([0, 2]);
  });

  it("still maps rows when the host adds extra decoration rows", () => {
    const parts = buildList([{ title: "Alpha" }, { title: "Beta" }]);
    parts.container.appendChild(createEl("div", { cls: "suggestion-empty", text: "extra" }));
    const context = makeContext(parts);

    expect(context.getCandidates().map((candidate) => candidate.text)).toEqual(["Alpha", "Beta"]);
  });

  it("falls back to the value when a row is missing", () => {
    const parts = buildList([{ title: "Alpha" }]);
    // Host rendered nothing for the value (lazy rendering, virtual list...).
    parts.container.textContent = "";
    parts.list.values = [{ name: "FromValue" }];
    const context = makeContext(parts);

    expect(context.getCandidates()[0]?.text).toBe("FromValue");
  });

  it("unwraps a fuzzy match wrapper when falling back to the value", () => {
    const parts = buildList([{ title: "Alpha" }]);
    parts.container.textContent = "";
    parts.list.values = [{ match: { score: 1 }, item: { path: "x/Alpha.md", basename: "Alpha" } }];
    const context = makeContext(parts);

    expect(context.getCandidates()[0]?.text).toBe("Alpha");
  });

  it("reads the query from an input element", () => {
    const parts = buildList([{ title: "Alpha" }]);
    const input = createEl("input");
    input.value = "  alpha  ";
    const context = makeContext(parts, input);

    expect(context.getQuery()).toBe("alpha");
  });

  it("returns an empty query when there is no input", () => {
    const parts = buildList([{ title: "Alpha" }]);
    expect(makeContext(parts).getQuery()).toBe("");
  });

  it("commits through the list API rather than the DOM", () => {
    const parts = buildList([{ title: "Alpha" }, { title: "Beta" }]);
    const context = makeContext(parts);

    context.commit(1);

    expect(parts.list.setSelectedItem).toHaveBeenCalledWith(1, expect.anything());
    expect(parts.list.useSelectedItem).toHaveBeenCalledTimes(1);
  });

  it("highlights without confirming", () => {
    const parts = buildList([{ title: "Alpha" }]);
    const context = makeContext(parts);

    context.setSelectedIndex(0);

    expect(parts.list.setSelectedItem).toHaveBeenCalledTimes(1);
    expect(parts.list.useSelectedItem).not.toHaveBeenCalled();
  });

  it("falls back to a click when the host has no useSelectedItem", () => {
    const parts = buildList([{ title: "Alpha" }, { title: "Beta" }]);
    parts.list.useSelectedItem = undefined;
    const context = makeContext(parts);

    const second = parts.container.querySelectorAll(".suggestion-item")[1];
    const listener = vi.fn();
    second?.addEventListener("click", listener);

    context.commit(1);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("clicks the row that belongs to the value index, past group headers", () => {
    const parts = buildList([
      { title: "Alpha" },
      { title: "Recent", group: true },
      { title: "Beta" },
    ]);
    parts.list.useSelectedItem = undefined;
    const context = makeContext(parts);

    const rows = parts.container.querySelectorAll(".suggestion-item");
    const clicked: string[] = [];
    rows.forEach((row) => {
      row.addEventListener("click", () => clicked.push(row.textContent?.trim() ?? ""));
    });

    // Index 2 is "Beta"; the old code would have clicked the first plain row.
    context.commit(2);

    expect(clicked).toHaveLength(1);
    // The row carries its note ("folder/path") too, so match on the title part.
    expect(clicked[0]).toContain("Beta");
  });

  it("is alive only while attached and non-empty", () => {
    const parts = buildList([{ title: "Alpha" }]);
    const context = makeContext(parts);
    expect(context.isAlive()).toBe(true);

    parts.container.remove();
    expect(context.isAlive()).toBe(false);
  });

  it("goes dead when the list empties", () => {
    const parts = buildList([{ title: "Alpha" }]);
    const context = makeContext(parts);

    parts.list.values = [];
    expect(context.isAlive()).toBe(false);
  });

  it("reports the selected index from the host list", () => {
    const parts = buildList([{ title: "Alpha" }]);
    parts.list.selectedItem = 2;
    const context = makeContext(parts);

    expect(context.getSelectedIndex()).toBe(2);
  });

  it("tracks manual navigation for the auto-match grace period", () => {
    const parts = buildList([{ title: "Alpha" }]);
    const context = makeContext(parts);

    expect(context.wasManuallyMoved(1000)).toBe(false);
    context.noteManualNavigation();
    expect(context.wasManuallyMoved(1000)).toBe(true);
    expect(context.wasManuallyMoved(0)).toBe(false);
  });
});
