import { describe, expect, it } from "vitest";
import { detectModalScene } from "../src/core/adapters/SuggestionAttacher";
import { isElementLike } from "../src/utils/dom";

describe("detectModalScene", () => {
  it("recognises a command", () => {
    expect(detectModalScene([{ id: "app:go-back", name: "Back", callback: () => {} }])).toBe(
      "command-palette",
    );
  });

  it("recognises a file", () => {
    expect(detectModalScene([{ path: "notes/a.md", basename: "a", extension: "md" }])).toBe(
      "quick-switcher",
    );
  });

  it("recognises a folder", () => {
    expect(detectModalScene([{ path: "notes", name: "notes" }])).toBe("quick-switcher");
  });

  it("falls back to a generic plugin modal", () => {
    expect(detectModalScene([{ label: "whatever" }])).toBe("plugin-modal");
  });

  it("says it cannot tell when the list carries no sample", () => {
    // Guessing here is what made a disabled scene come back to life: the
    // quick switcher went empty and was filed under a different scene, whose
    // toggle then decided whether the shortcuts ran.
    expect(detectModalScene([])).toBeNull();
  });

  it("says it cannot tell for the create-new-file placeholder", () => {
    // Obsidian's placeholder has a null value; it is an action, not a result.
    expect(detectModalScene([null])).toBeNull();
  });

  it("ignores group headers when sampling", () => {
    const values = [
      { type: "group", title: "Files" },
      { path: "notes/a.md", basename: "a" },
    ];
    expect(detectModalScene(values)).toBe("quick-switcher");
  });

  it("ignores a group-only list", () => {
    expect(detectModalScene([{ type: "group", title: "Files" }])).toBeNull();
  });

  it("does not mistake an id-only object for a command", () => {
    expect(detectModalScene([{ id: "x", name: "X" }])).toBe("plugin-modal");
  });

  it("sees through the wrapper FuzzySuggestModal adds", () => {
    // FuzzySuggestModal pushes `{ match, item }` rather than the item itself.
    const values = [{ match: { score: 1 }, item: { path: "notes/a.md", basename: "a" } }];
    expect(detectModalScene(values)).toBe("quick-switcher");
  });

  it("sees through the quick switcher wrapper", () => {
    // The switcher pushes `{ type, file, match, downranked }`.
    const values = [{ type: "file", file: { path: "notes/a.md", basename: "a" }, match: {} }];
    expect(detectModalScene(values)).toBe("quick-switcher");
  });

  it("recognises wrapped commands too", () => {
    const values = [{ match: {}, item: { id: "app:go-back", name: "Back", callback: () => {} } }];
    expect(detectModalScene(values)).toBe("command-palette");
  });
});

describe("isElementLike", () => {
  it("accepts a real element", () => {
    expect(isElementLike(createEl("div"))).toBe(true);
  });

  it("accepts an element from another realm", () => {
    // A popout node is still an object with nodeType 1, but fails instanceof.
    const foreign = { nodeType: 1, querySelectorAll: () => [] };
    expect(isElementLike(foreign)).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isElementLike(null)).toBe(false);
    expect(isElementLike(undefined)).toBe(false);
    expect(isElementLike({})).toBe(false);
    expect(isElementLike({ nodeType: 3 })).toBe(false);
    expect(isElementLike("iframe")).toBe(false);
    expect(isElementLike(42)).toBe(false);
  });
});
