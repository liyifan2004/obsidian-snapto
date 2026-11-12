import { beforeEach, describe, expect, it, vi } from "vitest";
import { MODIFIER_BODY_CLASS, ModifierTracker } from "../src/core/ModifierTracker";

/** A foreign window, standing in for a popout. */
function fakeDocument() {
  const body = createEl("div");
  const listeners = new Set<string>();
  const handlers = new Map<string, (evt: Event) => void>();
  const win: Record<string, unknown> = {
    addEventListener: vi.fn((type: string, handler: (evt: Event) => void) => {
      listeners.add(type);
      handlers.set(type, handler);
    }),
    removeEventListener: vi.fn((type: string) => {
      listeners.delete(type);
      handlers.delete(type);
    }),
  };
  const doc = { body, defaultView: win } as unknown as Document;
  // `pagehide` targets the window, and the handler reads the document off it.
  win.document = doc;
  return { doc, body, win, listeners, handlers };
}

function keyDown(key: string): KeyboardEvent {
  return new KeyboardEvent("keydown", { key });
}

describe("ModifierTracker", () => {
  beforeEach(() => {
    document.body.className = "";
  });

  it("wires one document only once", () => {
    const tracker = new ModifierTracker(document, "Mod", () => {});
    const spy = vi.spyOn(window, "addEventListener");

    tracker.start();
    tracker.attachDocument(document);

    const keydownCalls = spy.mock.calls.filter((call) => call[0] === "keydown");
    expect(keydownCalls).toHaveLength(1);
    expect(tracker.documentCount()).toBe(1);

    tracker.stop();
  });

  it("marks the body while the modifier is held", () => {
    const tracker = new ModifierTracker(document, "Mod", () => {});
    tracker.start();

    window.dispatchEvent(keyDown("Control"));
    expect(document.body.classList.contains(MODIFIER_BODY_CLASS)).toBe(true);

    window.dispatchEvent(keyDown("Control"));
    // A repeat keydown must not flap the class.
    expect(document.body.classList.contains(MODIFIER_BODY_CLASS)).toBe(true);

    tracker.stop();
  });

  it("clears the body class on keyup", () => {
    const tracker = new ModifierTracker(document, "Mod", () => {});
    tracker.start();

    window.dispatchEvent(keyDown("Control"));
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "Control" }));

    expect(document.body.classList.contains(MODIFIER_BODY_CLASS)).toBe(false);
    tracker.stop();
  });

  it("leaves no class behind after stop", () => {
    const tracker = new ModifierTracker(document, "Mod", () => {});
    tracker.start();

    window.dispatchEvent(keyDown("Control"));
    tracker.stop();

    expect(document.body.classList.contains(MODIFIER_BODY_CLASS)).toBe(false);
    expect(tracker.documentCount()).toBe(0);
  });

  it("reports arrow keys so auto match can back off", () => {
    const onNavigate = vi.fn();
    const tracker = new ModifierTracker(document, "Mod", onNavigate);
    tracker.start();

    window.dispatchEvent(keyDown("ArrowDown"));
    window.dispatchEvent(keyDown("a"));

    expect(onNavigate).toHaveBeenCalledTimes(1);
    tracker.stop();
  });

  it("tracks a second document and clears both on stop", () => {
    const tracker = new ModifierTracker(document, "Mod", () => {});
    const popout = fakeDocument();

    tracker.start();
    tracker.attachDocument(popout.doc);

    expect(tracker.documentCount()).toBe(2);
    expect(popout.listeners.has("keydown")).toBe(true);
    expect(popout.listeners.has("keyup")).toBe(true);

    window.dispatchEvent(keyDown("Control"));
    expect(popout.body.classList.contains(MODIFIER_BODY_CLASS)).toBe(true);

    tracker.stop();

    expect(popout.listeners.size).toBe(0);
    expect(popout.body.classList.contains(MODIFIER_BODY_CLASS)).toBe(false);
  });

  it("lights up a document that opens while the key is held", () => {
    const tracker = new ModifierTracker(document, "Mod", () => {});
    tracker.start();
    window.dispatchEvent(keyDown("Control"));

    const popout = fakeDocument();
    tracker.attachDocument(popout.doc);

    expect(popout.body.classList.contains(MODIFIER_BODY_CLASS)).toBe(true);
    tracker.stop();
  });

  it("releases a document that is detached", () => {
    const tracker = new ModifierTracker(document, "Mod", () => {});
    const popout = fakeDocument();

    tracker.start();
    tracker.attachDocument(popout.doc);
    expect(tracker.documentCount()).toBe(2);

    tracker.detachDocument(popout.doc);

    expect(tracker.documentCount()).toBe(1);
    expect(popout.listeners.size).toBe(0);
    expect(popout.body.classList.contains(MODIFIER_BODY_CLASS)).toBe(false);

    // The remaining document still works.
    window.dispatchEvent(keyDown("Control"));
    expect(document.body.classList.contains(MODIFIER_BODY_CLASS)).toBe(true);

    tracker.stop();
  });

  it("detaches on pagehide from that window", () => {
    const tracker = new ModifierTracker(document, "Mod", () => {});
    const popout = fakeDocument();

    tracker.start();
    tracker.attachDocument(popout.doc);

    const pagehide = popout.handlers.get("pagehide");
    expect(pagehide).toBeDefined();

    pagehide?.({ target: popout.win } as unknown as Event);

    expect(tracker.documentCount()).toBe(1);
    expect(popout.listeners.has("pagehide")).toBe(false);

    tracker.stop();
  });

  it("drops the class everywhere when the modifier changes", () => {
    const tracker = new ModifierTracker(document, "Mod", () => {});
    tracker.start();
    window.dispatchEvent(keyDown("Control"));
    expect(document.body.classList.contains(MODIFIER_BODY_CLASS)).toBe(true);

    tracker.setModifier("Alt");

    expect(document.body.classList.contains(MODIFIER_BODY_CLASS)).toBe(false);
    tracker.stop();
  });
});
