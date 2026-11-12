import type { SceneId } from "../types";
import type { SearchContextManager } from "./SearchContextManager";
import type { SuggestionContext } from "./SuggestionContext";

export interface SurfaceBinderDeps {
  contexts: SearchContextManager;
  /** Is this scene allowed by settings? */
  isSceneEnabled(scene: SceneId): boolean;
  /** Release surfaces that already closed. */
  prune(): void;
  /** First time this host is seen: shortcuts, watcher and badges. */
  onAttach(context: SuggestionContext): void;
  /** Same host opened again: refresh what depends on current settings. */
  onReuse(context: SuggestionContext): void;
  log(message: string, ...rest: unknown[]): void;
}

/**
 * Turns "a host surface opened" into at most one context per host instance.
 *
 * The dedupe is not an optimisation. `PopoverSuggest.open()` returns early when
 * the popover is already open, but our wrapper still runs on every keystroke;
 * without this, typing four characters would create four contexts, 36 keymap
 * handlers, four observers and four concurrent auto-match timers.
 */
export class SurfaceBinder {
  constructor(private readonly deps: SurfaceBinderDeps) {}

  bind(host: unknown, attach: () => SuggestionContext | null): SuggestionContext | null {
    this.deps.prune();

    const existing = this.deps.contexts.findByHost(host);
    if (existing) {
      this.deps.contexts.touch(existing.id);
      this.deps.onReuse(existing);
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
    if (!this.deps.isSceneEnabled(context.scene)) {
      this.deps.log("scene disabled", context.scene);
      return null;
    }

    this.deps.contexts.add(context);
    this.deps.onAttach(context);
    this.deps.log("attached", context.scene, context.id);
    return context;
  }
}
