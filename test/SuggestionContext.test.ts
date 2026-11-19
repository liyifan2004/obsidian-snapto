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

  it("skips a row the host marks as a heading even when its value says otherwise", () => {
    // The row carries `mod-group`, so it is a heading. A value that does not
    // say "group" must not put it back into the result list — otherwise the
    // badge on it and the row `Ctrl+1` opens drift apart.
    const parts = buildList([{ title: "Recent", group: true }, { title: "Alpha" }]);
    parts.list.values = [{ name: "Recent" }, { name: "Alpha" }];
    const context = makeContext(parts);

    const candidates = context.getCandidates();
    expect(candidates.map((candidate) => candidate.text)).toEqual(["Alpha"]);
  });

  it("still maps rows when the host adds extra decoration rows", () => {
    const parts = buildList([{ title: "Alpha" }, { title: "Beta" }]);
    parts.container.appendChild(createEl("div", { cls: "suggestion-empty", text: "extra" }));
    const context = makeContext(parts);

    expect(context.getCandidates().map((candidate) => candidate.text)).toEqual(["Alpha", "Beta"]);
  });

  it("does not read a title off a decoration row when the counts drift", () => {
    // A third party inserted a plain row that carries no value of its own.
    // Pairing by position read "Alpha" from the decoration row's text, and
    // the plugin would then act on the wrong note.
    const parts = buildList([{ title: "Alpha" }, { title: "Beta" }]);
    const decoration = createEl("div", { cls: "suggestion-item" });
    decoration.setText("Decoration");
    parts.container.insertBefore(decoration, parts.container.firstChild);
    const context = makeContext(parts);

    const candidates = context.getCandidates();
    expect(candidates.map((candidate) => candidate.text)).toEqual(["Alpha", "Beta"]);
    expect(candidates.map((candidate) => candidate.index)).toEqual([0, 1]);
  });

  it("leaves a value unpaired rather than giving it the wrong row", () => {
    // The counts drift and the value's title appears nowhere among the rows.
    // A guess would pick a row that shows something else; leaving it
    // unpaired keeps the index right, and the text falls back to the value.
    const parts = buildList([{ title: "Alpha" }]);
    const decoration = createEl("div", { cls: "suggestion-item" });
    decoration.setText("Decoration");
    parts.container.insertBefore(decoration, parts.container.firstChild);
    parts.list.values = [{ name: "FromValue" }];
    const context = makeContext(parts);

    const candidates = context.getCandidates();
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.index).toBe(0);
    expect(candidates[0]?.text).toBe("FromValue");
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

  it("reads the query from a foreign input element", () => {
    const parts = buildList([{ title: "Alpha" }]);
    // An input from a popout window fails instanceof in this realm.
    const foreign = { value: "beta", textContent: null } as unknown as HTMLInputElement;
    const context = makeContext(parts, foreign);

    expect(context.getQuery()).toBe("beta");
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

  it("carries the modifier of the key that triggered the choice", () => {
    const parts = buildList([{ title: "Alpha" }, { title: "Beta" }]);
    const context = makeContext(parts);

    // Obsidian reads the modifier off the event to decide between replacing
    // the current leaf and opening a new tab. A synthetic event without the
    // flags silently drops it.
    context.commit(1, new KeyboardEvent("keydown", { key: "2", ctrlKey: true }));

    const use = parts.list.useSelectedItem as unknown as ReturnType<typeof vi.fn>;
    const event = use.mock.calls[0]?.[0] as KeyboardEvent;
    expect(event.ctrlKey).toBe(true);
  });

  it("sends no modifier when the choice did not come from a key", () => {
    const parts = buildList([{ title: "Alpha" }]);
    const context = makeContext(parts);

    context.commit(0);

    const use = parts.list.useSelectedItem as unknown as ReturnType<typeof vi.fn>;
    const event = use.mock.calls[0]?.[0] as KeyboardEvent;
    expect(event.ctrlKey).toBe(false);
    expect(event.metaKey).toBe(false);
    expect(event.altKey).toBe(false);
    expect(event.shiftKey).toBe(false);
  });

  it("reads the modifier off an event from another window", () => {
    const parts = buildList([{ title: "Alpha" }]);
    const context = makeContext(parts);

    // A popout window's event fails `instanceof KeyboardEvent` in this realm,
    // so the flags have to be read by shape or the modifier is lost there.
    const foreign = {
      type: "keydown",
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
    } as unknown as Event;

    context.commit(0, foreign);

    const use = parts.list.useSelectedItem as unknown as ReturnType<typeof vi.fn>;
    const event = use.mock.calls[0]?.[0] as KeyboardEvent;
    expect(event.ctrlKey).toBe(true);
  });

  it("ignores the modifier flags of a mouse event", () => {
    const parts = buildList([{ title: "Alpha" }]);
    const context = makeContext(parts);

    // A click carries ctrlKey as well, but it is not a key press.
    const mouse = {
      type: "click",
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
    } as unknown as Event;

    context.commit(0, mouse);

    const use = parts.list.useSelectedItem as unknown as ReturnType<typeof vi.fn>;
    const event = use.mock.calls[0]?.[0] as KeyboardEvent;
    expect(event.ctrlKey).toBe(false);
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

  it("stays alive when the list empties", () => {
    const parts = buildList([{ title: "Alpha" }]);
    const context = makeContext(parts);

    // No results is a normal state while the surface is still mounted.
    parts.list.values = [];
    expect(context.isAlive()).toBe(true);
    expect(context.getCandidates()).toHaveLength(0);

    // Only losing the container ends the surface.
    parts.container.remove();
    expect(context.isAlive()).toBe(false);
  });

  it("does not offer the create-new-file placeholder as a result", () => {
    // Obsidian renders this row when nothing matches: the title is the query
    // the user typed and the aux area carries the "press Enter to create" hint.
    const container = createEl("div", { cls: "prompt-results" });
    const row = container.createEl("div", { cls: "suggestion-item" });
    const content = row.createEl("div", { cls: "suggestion-content" });
    content.createEl("div", { cls: "suggestion-title", text: "zzz-nothing" });
    row.createEl("div", { cls: "suggestion-aux" }).appendChild(
      createSpan({ cls: "suggestion-action", text: "press Enter to create" }),
    );
    document.body.appendChild(container);

    const list: SuggestionListLike = {
      values: [null],
      selectedItem: 0,
      containerEl: container,
      setSelectedItem: vi.fn(),
      useSelectedItem: vi.fn(() => true),
    };
    const context = makeContext({ container, list, values: list.values as unknown[] });

    expect(context.getCandidates()).toHaveLength(0);
  });

  it("keeps the last confirmed scene when the list goes empty", () => {
    const parts = buildList([{ title: "Alpha" }]);
    const context = makeContext(parts);
    context.setSceneResolver(() => "quick-switcher");
    expect(context.scene).toBe("quick-switcher");

    // The list emptied: the detector can no longer tell what this is.
    context.setSceneResolver(() => null);
    expect(context.scene).toBe("quick-switcher");
  });

  it("takes a newly detected scene once the list has results again", () => {
    const parts = buildList([{ title: "Alpha" }]);
    const context = makeContext(parts);
    context.setSceneResolver(() => "quick-switcher");
    expect(context.scene).toBe("quick-switcher");

    context.setSceneResolver(() => "command-palette");
    expect(context.scene).toBe("command-palette");
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
