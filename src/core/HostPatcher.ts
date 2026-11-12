import { PopoverSuggest, SuggestModal } from "obsidian";

type AnyFn = (...args: unknown[]) => unknown;

export interface HostPatchHandlers {
  onModalOpen(modal: unknown): void;
  onSuggestOpen(host: unknown): void;
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
  private installed = false;

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

    const wrapped = function (this: unknown, ...args: unknown[]): unknown {
      const result = fn.apply(this, args);
      if (!state.active) return result;
      // Never let our bookkeeping break the host: an unexpected shape in a
      // third-party modal must cost us that modal, not the user's search.
      try {
        after(this);
      } catch {
        // Intentionally swallowed.
      }
      return result;
    };

    target[method] = wrapped;

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
