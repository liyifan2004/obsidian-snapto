import type { SuggestionContext } from "./SuggestionContext";

export type ContextListener = (contexts: readonly SuggestionContext[]) => void;

/**
 * Keeps every live search surface, newest first.
 *
 * Several surfaces can be alive at once: a modal opened on top of a popover,
 * or an editor suggest while a modal is still mounted. "Active" therefore means
 * "most recently touched and still attached to the document", never "the only
 * one".
 */
export class SearchContextManager {
  private readonly contexts = new Map<string, SuggestionContext>();
  private readonly order: string[] = [];
  private readonly listeners = new Set<ContextListener>();

  add(context: SuggestionContext): void {
    this.contexts.set(context.id, context);
    this.touch(context.id);
    this.emit();
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
    this.emit();
  }

  /** Drop surfaces whose container left the document. */
  prune(): void {
    let changed = false;
    for (const [id, context] of this.contexts) {
      if (!context.isAlive()) {
        this.contexts.delete(id);
        const index = this.order.indexOf(id);
        if (index >= 0) this.order.splice(index, 1);
        changed = true;
      }
    }
    if (changed) this.emit();
  }

  get(id: string): SuggestionContext | null {
    return this.contexts.get(id) ?? null;
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

  subscribe(listener: ContextListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  clear(): void {
    this.contexts.clear();
    this.order.length = 0;
    this.emit();
  }

  private emit(): void {
    const snapshot = this.all();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {
        // One bad listener must not break the others.
      }
    }
  }
}
