import { describe, expect, it, vi } from "vitest";
import { GenerationDebouncer } from "../src/utils/debounce";

/** A window whose timers fire only when the test says so. */
function fakeWindow() {
  let nextId = 1;
  const pending = new Map<number, () => void>();

  const win = {
    setTimeout: (fn: () => void) => {
      const id = nextId;
      nextId += 1;
      pending.set(id, fn);
      return id;
    },
    clearTimeout: (id: number) => {
      pending.delete(id);
    },
  };

  return {
    win: win as unknown as Window,
    flush(): void {
      const callbacks = Array.from(pending.values());
      pending.clear();
      for (const callback of callbacks) callback();
    },
    pendingCount(): number {
      return pending.size;
    },
  };
}

describe("GenerationDebouncer", () => {
  it("runs the callback once after the delay", () => {
    const harness = fakeWindow();
    const debouncer = new GenerationDebouncer(harness.win);
    const run = vi.fn();

    debouncer.schedule(1000, run);
    harness.flush();

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("drops the previous run when new input arrives", () => {
    const harness = fakeWindow();
    const debouncer = new GenerationDebouncer(harness.win);
    const first = vi.fn();
    const second = vi.fn();

    debouncer.schedule(1000, first);
    debouncer.schedule(1000, second);
    harness.flush();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("reports older generations as stale", () => {
    const harness = fakeWindow();
    const debouncer = new GenerationDebouncer(harness.win);

    const task = debouncer.schedule(1000, () => {});
    expect(debouncer.isStale(task.generation)).toBe(false);

    debouncer.schedule(1000, () => {});
    expect(debouncer.isStale(task.generation)).toBe(true);
  });

  it("marks a generation stale after cancel", () => {
    const harness = fakeWindow();
    const debouncer = new GenerationDebouncer(harness.win);

    const task = debouncer.schedule(1000, () => {});
    debouncer.cancel();

    expect(debouncer.isStale(task.generation)).toBe(true);
    expect(harness.pendingCount()).toBe(0);
  });
});
