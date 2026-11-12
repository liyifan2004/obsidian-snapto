import type { SearchContextManager } from "./SearchContextManager";
import type { SuggestionContext } from "./SuggestionContext";

export interface SurfaceBinderDeps {
  contexts: SearchContextManager;
  /** Release surfaces that already closed. */
  prune(): void;
  /** Bring one context in line with current settings. Must be idempotent. */
  onBind(context: SuggestionContext): void;
  log(message: string, ...rest: unknown[]): void;
}

/**
 * Turns "a host surface opened" into at most one context per host instance.
 *
 * The dedupe is not an optimisation. `PopoverSuggest.open()` returns early when
 * the popover is already open, but our wrapper still runs on every keystroke;
 * without this, typing four characters would create four contexts, 36 keymap
 * handlers, four observers and four concurrent auto-match timers.
 *
 * Both branches call `onBind`, deliberately. A surface that opens again while
 * its scene is disabled has to pass through the same reconciliation as any
 * other, otherwise turning a scene off would be undone by the next keystroke.
 * Whether the scene is enabled is decided there, in one place, not here.
 */
export class SurfaceBinder {
  constructor(private readonly deps: SurfaceBinderDeps) {}

  bind(host: unknown, attach: () => SuggestionContext | null): SuggestionContext | null {
    this.deps.prune();

    const existing = this.deps.contexts.findByHost(host);
    if (existing) {
      this.deps.contexts.touch(existing.id);
      this.deps.onBind(existing);
      this.deps.log("reused", existing.scene, existing.id);
      return existing;
    }

    let context: SuggestionContext | null = null;
    try {
      context = attach();
    } catch (error) {
      // One unreadable surface must not take down the others.
      this.deps.log("attach failed", error);
      return null;
    }
    if (!context) return null;

    this.deps.contexts.add(context);
    this.deps.onBind(context);
    this.deps.log("attached", context.scene, context.id);
    return context;
  }
}
