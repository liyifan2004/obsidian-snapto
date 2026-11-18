import { PopoverSuggest, SuggestModal } from "obsidian";

type AnyFn = (...args: unknown[]) => unknown;

export interface HostPatchHandlers {
  onModalOpen(modal: unknown): void;
  onSuggestOpen(host: unknown): void;
}

/** One patched method and the evidence that our layer is still in the chain. */
interface PatchEntry {
  target: Record<string, unknown>;
  method: string;
  /** The wrapper we installed. */
  wrapped: unknown;
  /** How many times our wrapper ran. */
  calls: number;
}

/**
 * The only place in the plugin that replaces Obsidian's own methods.
 *
 * Scope is deliberately narrow: `SuggestModal.prototype.open` and
 * `PopoverSuggest.prototype.open` are wrapped so the plugin learns *which*
 * surfaces opened and can read their live list. Nothing else is patched, the
 * original is always called first, and the return value is passed through.
 *
 * Assignment creates an own property on the subclass prototype, so other
 * `Modal` subclasses are untouched.
 *
 * Unload has to survive two awkward cases:
 *
 * - Another plugin wrapped us after we installed. Deleting the property would
 *   throw away their layer too, so the restore is skipped and our wrapper stays
 *   in the chain as a transparent forwarder (its `active` flag is off).
 * - The property is no longer ours for any other reason. Same rule: do not
 *   touch what we do not own.
 */
export class HostPatcher {
  private readonly restorers: Array<() => void> = [];
  private readonly patches: PatchEntry[] = [];
  private installed = false;

  /**
   * Whether our wrapper is still reachable and really fires.
   *
   * `installed` only says that `install()` ran; it stays true for the whole
   * session, so it cannot answer "are the prototypes patched right now" —
   * the question a runtime check asks. Answering that with a flag that is
   * always true is worse than not answering at all, because the check would
   * pass on a plugin that never patched anything.
   *
   * Two things have to hold for each patched method. Our wrapper must still
   * be the live property, or something must have called through it — a
   * third-party layer that wraps ours still reaches us, and the call count
   * is the evidence. A wrapper that was replaced by something that does not
   * call through fails both, and that is the case worth catching.
   */
  get isActive(): boolean {
    if (!this.installed) return false;
    if (this.patches.length === 0) return false;
    return this.patches.every((entry) => {
      if (entry.target[entry.method] === entry.wrapped) return true;
      return entry.calls > 0;
    });
  }

  /**
   * How many times our wrapper ran.
   *
   * A count above zero cannot be reached by accident: the wrapper has to
   * have been called. The runtime check reads it after opening a surface.
   */
  get callCount(): number {
    return this.patches.reduce((total, entry) => total + entry.calls, 0);
  }

  install(handlers: HostPatchHandlers): void {
    if (this.installed) return;
    this.installed = true;

    this.patch(SuggestModal.prototype, "open", (self) => handlers.onModalOpen(self));
    this.patch(PopoverSuggest.prototype, "open", (self) => handlers.onSuggestOpen(self));
  }

  private patch(proto: object, method: string, after: (self: unknown) => void): void {
    const target = proto as Record<string, unknown>;
    const original = target[method];
    if (typeof original !== "function") return;

    const hadOwn = Object.prototype.hasOwnProperty.call(proto, method);
    const fn = original as AnyFn;
    const state = { active: true };
    const entry: PatchEntry = { target, method, wrapped: null, calls: 0 };

    const wrapped = function (this: unknown, ...args: unknown[]): unknown {
      const result = fn.apply(this, args);
      if (!state.active) return result;
      entry.calls += 1;
      // Never let our bookkeeping break the host: an unexpected shape in a
      // third-party modal must cost us that modal, not the user's search.
      try {
        after(this);
      } catch {
        // Intentionally swallowed.
      }
      return result;
    };

    entry.wrapped = wrapped;
    target[method] = wrapped;
    this.patches.push(entry);

    this.restorers.push(() => {
      // From here on the wrapper only forwards.
      state.active = false;
      if (target[method] !== wrapped) return;
      if (hadOwn) {
        target[method] = original;
      } else {
        delete target[method];
      }
    });
  }

  uninstall(): void {
    while (this.restorers.length > 0) {
      const restore = this.restorers.pop();
      try {
        restore?.();
      } catch {
        // A failed restore must not block the remaining ones.
      }
    }
    this.installed = false;
  }
}
