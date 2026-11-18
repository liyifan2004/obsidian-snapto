import type { ModifierKey } from "../settings/DefaultSettings";
import type { SuggestionContext } from "./SuggestionContext";

interface ScopeLike {
  register(
    modifiers: string[] | null,
    key: string | null,
    func: (evt: KeyboardEvent) => boolean | void,
  ): unknown;
  unregister(handler: unknown): void;
}

export interface ShortcutOptions {
  enabled: boolean;
  modifier: ModifierKey;
  /** Highest row number reachable, i.e. 1..maxIndex. */
  maxIndex: number;
  /**
   * Scene the context belongs to. Part of the registration signature so that
   * moving a surface between scenes forces a re-register even if `enabled`
   * happens to end up the same. Defensive: every caller goes through
   * `reconcile`, which already folds the scene into `enabled`.
   */
  scene: string;
}

interface Registration {
  scope: ScopeLike;
  handlers: unknown[];
  signature: string;
  /** Rows the shortcut resolves against, refreshed on every keypress. */
  context: SuggestionContext;
}

/**
 * Registers Mod+1..N on the scope that already belongs to the live surface.
 *
 * Obsidian pushes that scope onto the keymap stack when the surface opens and
 * pops it on close, so handlers inherit the right lifetime for free: no global
 * key listener, no manual push/pop, no risk of hijacking shortcuts after the
 * modal is gone.
 */
export class ShortcutManager {
  private readonly registrations = new Map<string, Registration>();

  sync(context: SuggestionContext, options: ShortcutOptions): void {
    const scope = context.scope as ScopeLike | null;
    if (!scope || typeof scope.register !== "function") return;

    const signature = `${options.enabled}|${options.modifier}|${options.maxIndex}|${options.scene}`;
    const existing = this.registrations.get(context.id);
    if (existing?.signature === signature) return;

    if (existing) this.unregister(existing);

    if (!options.enabled) {
      this.registrations.delete(context.id);
      return;
    }

    const handlers: unknown[] = [];
    for (let number = 1; number <= options.maxIndex; number += 1) {
      const index = number - 1;
      const handler = scope.register([options.modifier], String(number), (evt: KeyboardEvent) => {
        if (evt.isComposing) return;
        return this.onNumberKey(context, index, evt);
      });
      handlers.push(handler);
    }

    this.registrations.set(context.id, {
      scope,
      handlers,
      signature,
      context,
    });
  }

  private onNumberKey(context: SuggestionContext, index: number, evt: KeyboardEvent): boolean | void {
    if (!context.isAlive()) return;
    const candidates = context.getCandidates();
    // A row past the end of the list must fall through to whatever else is bound.
    if (index >= candidates.length) return;

    const target = candidates[index];
    if (!target) return;

    // The key event travels with the choice so the host can still see the
    // modifier. Obsidian uses it to decide between replacing the current note
    // and opening a new tab.
    context.commit(target.index, evt);
    return false;
  }

  private unregister(registration: Registration): void {
    const scope = registration.scope;
    for (const handler of registration.handlers) {
      try {
        scope.unregister(handler);
      } catch {
        // Scope may already be gone; nothing to clean up.
      }
    }
  }

  dispose(contextId: string): void {
    const registration = this.registrations.get(contextId);
    if (!registration) return;
    this.unregister(registration);
    this.registrations.delete(contextId);
  }

  clear(): void {
    for (const registration of this.registrations.values()) this.unregister(registration);
    this.registrations.clear();
  }

  count(): number {
    return this.registrations.size;
  }
}
