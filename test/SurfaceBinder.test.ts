import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchContextManager } from "../src/core/SearchContextManager";
import { ShortcutManager } from "../src/core/ShortcutManager";
import { SuggestionContext, type SuggestionListLike } from "../src/core/SuggestionContext";
import { SurfaceBinder } from "../src/core/SurfaceBinder";

interface FakeScope {
  handlers: unknown[];
  register(modifiers: string[] | null, key: string | null, fn: unknown): unknown;
  unregister(handler: unknown): void;
}

function fakeScope(): FakeScope {
  const handlers: unknown[] = [];
  return {
    handlers,
    register() {
      const handler = {};
      handlers.push(handler);
      return handler;
    },
    unregister(handler) {
      const index = handlers.indexOf(handler);
      if (index >= 0) handlers.splice(index, 1);
    },
  };
}

/** A host instance plus the container its context will read. */
function makeHost(titles: string[]) {
  const container = createEl("div", { cls: "prompt-results" });
  document.body.appendChild(container);
  const values: unknown[] = [];

  for (const title of titles) {
    const row = container.createEl("div", { cls: "suggestion-item" });
    const content = row.createEl("div", { cls: "suggestion-content" });
    content.createEl("div", { cls: "suggestion-title", text: title });
    values.push({ name: title });
  }

  const list: SuggestionListLike = {
    values,
    selectedItem: 0,
    containerEl: container,
    setSelectedItem: vi.fn(),
    useSelectedItem: vi.fn(() => true),
  };

  const host = { suggestions: list, scope: fakeScope() };
  return { host, list, container, values };
}

function makeBinder() {
  const contexts = new SearchContextManager();
  const shortcuts = new ShortcutManager();
  const binds = vi.fn();
  const log = vi.fn();

  const binder = new SurfaceBinder({
    contexts,
    prune: () => {
      for (const context of contexts.all()) {
        if (context.isAlive()) continue;
        shortcuts.dispose(context.id);
        contexts.remove(context.id);
      }
    },
    // Every bind goes through here, first attach and reuse alike.
    onBind: (context) => {
      binds(context);
      shortcuts.sync(context, { enabled: true, modifier: "Mod", maxIndex: 9 });
    },
    log,
  });

  return { binder, contexts, shortcuts, binds, log };
}

function attachFrom(parts: ReturnType<typeof makeHost>, id: string) {
  return () =>
    new SuggestionContext({
      id,
      host: parts.host,
      scene: "popover-suggest",
      list: parts.list,
      containerEl: parts.container,
      inputEl: null,
      scope: parts.host.scope,
      doc: document,
    });
}

describe("SurfaceBinder", () => {
  beforeEach(() => {
    document.body.textContent = "";
  });

  it("keeps one context when the same host opens three times", () => {
    const parts = makeHost(["Alpha"]);
    const { binder, contexts, shortcuts } = makeBinder();
    let serial = 0;

    for (let i = 0; i < 3; i += 1) {
      serial += 1;
      binder.bind(parts.host, attachFrom(parts, `ctx-${serial}`));
    }

    expect(contexts.size()).toBe(1);
    expect(shortcuts.count()).toBe(1);
    expect(parts.host.scope.handlers).toHaveLength(9);
  });

  it("reuses the existing context instead of building a new one", () => {
    const parts = makeHost(["Alpha"]);
    const { binder } = makeBinder();
    const attach = vi.fn(attachFrom(parts, "ctx-1"));

    const first = binder.bind(parts.host, attach);
    const second = binder.bind(parts.host, attach);

    expect(attach).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it("reconciles on every bind, first attach and reuse alike", () => {
    const parts = makeHost(["Alpha"]);
    const { binder, binds } = makeBinder();

    binder.bind(parts.host, attachFrom(parts, "ctx-1"));
    binder.bind(parts.host, attachFrom(parts, "ctx-2"));

    // Scene state is applied in onBind, so a repeat open re-applies it rather
    // than resurrecting what a settings change switched off.
    expect(binds).toHaveBeenCalledTimes(2);
  });

  it("starts a fresh context once the previous one closed", () => {
    const first = makeHost(["Alpha"]);
    const second = makeHost(["Beta"]);
    const { binder, contexts } = makeBinder();

    binder.bind(first.host, attachFrom(first, "ctx-a"));
    // Closing detaches the container: the old context can no longer be alive.
    first.container.remove();

    binder.bind(second.host, attachFrom(second, "ctx-b"));

    expect(contexts.size()).toBe(1);
    expect(contexts.active()?.id).toBe("ctx-b");
  });

  it("keeps a surface whose list is empty", () => {
    const parts = makeHost(["Alpha"]);
    const { binder, contexts } = makeBinder();

    binder.bind(parts.host, attachFrom(parts, "ctx-1"));
    // A query with no results: the container is still mounted.
    parts.list.values = [];

    expect(contexts.findByHost(parts.host)).not.toBeNull();
    binder.bind(parts.host, attachFrom(parts, "ctx-2"));
    expect(contexts.size()).toBe(1);
  });

  it("survives an adapter that throws", () => {
    const { binder, contexts } = makeBinder();

    expect(() =>
      binder.bind({}, () => {
        throw new Error("boom");
      }),
    ).not.toThrow();
    expect(contexts.size()).toBe(0);
  });

  it("does nothing when the adapter declines the host", () => {
    const { binder, contexts } = makeBinder();
    expect(binder.bind({}, () => null)).toBeNull();
    expect(contexts.size()).toBe(0);
  });
});
