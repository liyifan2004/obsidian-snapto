import type { SuggestionContext } from "./SuggestionContext";

/**
 * Keeps every live search surface, newest first.
 *
 * Several surfaces can be alive at once: a modal opened on top of a popover,
 * or an editor suggest while a modal is still mounted. "Active" therefore means
 * "most recently touched and still attached to the document", never "the only
 * one".
 *
 * There is deliberately no subscription mechanism: the plugin reconciles every
 * context itself when settings change, and a listener registry with no second
 * consumer is just another place for state to drift.
 */
export class SearchContextManager {
  private readonly contexts = new Map<string, SuggestionContext>();
  private readonly order: string[] = [];

  add(context: SuggestionContext): void {
    this.contexts.set(context.id, context);
    this.touch(context.id);
  }

  /** Mark a context as the most recent one, e.g. on focus or keystroke. */
  touch(id: string): void {
    const index = this.order.indexOf(id);
    if (index >= 0) this.order.splice(index, 1);
    this.order.push(id);
  }

  remove(id: string): void {
    if (!this.contexts.delete(id)) return;
    const index = this.order.indexOf(id);
    if (index >= 0) this.order.splice(index, 1);
  }

  get(id: string): SuggestionContext | null {
    return this.contexts.get(id) ?? null;
  }

  /**
   * Live context built from this exact host instance, if any.
   *
   * A `PopoverSuggest` calls `open()` on every keystroke and returns early when
   * already open, but our wrapper still runs. Without this lookup each keystroke
   * would add another context, another nine key handlers and another observer.
   */
  findByHost(host: unknown): SuggestionContext | null {
    for (let i = this.order.length - 1; i >= 0; i -= 1) {
      const id = this.order[i];
      if (id === undefined) continue;
      const context = this.contexts.get(id);
      if (context && context.host === host && context.isAlive()) return context;
    }
    return null;
  }

  /** Most recent live context, or null. */
  active(): SuggestionContext | null {
    for (let i = this.order.length - 1; i >= 0; i -= 1) {
      const id = this.order[i];
      if (id === undefined) continue;
      const context = this.contexts.get(id);
      if (context?.isAlive()) return context;
    }
    return null;
  }

  all(): SuggestionContext[] {
    return this.order
      .map((id) => this.contexts.get(id))
      .filter((context): context is SuggestionContext => context !== undefined);
  }

  size(): number {
    return this.contexts.size;
  }

  clear(): void {
    this.contexts.clear();
    this.order.length = 0;
  }
}
