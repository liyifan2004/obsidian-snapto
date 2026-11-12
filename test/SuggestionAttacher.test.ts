import { describe, expect, it } from "vitest";
import { detectModalScene } from "../src/core/adapters/SuggestionAttacher";

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

  it("handles an empty list", () => {
    expect(detectModalScene([])).toBe("plugin-modal");
  });

  it("ignores group headers when sampling", () => {
    const values = [
      { type: "group", title: "Files" },
      { path: "notes/a.md", basename: "a" },
    ];
    expect(detectModalScene(values)).toBe("quick-switcher");
  });

  it("does not mistake an id-only object for a command", () => {
    expect(detectModalScene([{ id: "x", name: "X" }])).toBe("plugin-modal");
  });
});
