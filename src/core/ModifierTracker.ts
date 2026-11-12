import { Platform } from "obsidian";
import type { ModifierKey } from "../settings/DefaultSettings";

export const MODIFIER_BODY_CLASS = "snapto-modifier-down";

/**
 * The body of a tracked document, or null once the window is tearing down.
 *
 * A closing window drops its body before the tracker hears about it, and a
 * throw here would propagate out of `reconcile`, be swallowed by `HostPatcher`,
 * and silently skip the shortcuts, badges and watcher for that bind.
 */
function bodyOf(doc: Document): HTMLElement | null {
  // `doc.body` is typed non-null by lib.dom but is null at runtime once the
  // window starts tearing down, so widen the type and let callers use `?.`.
  const body: HTMLElement | null = doc.body;
  return body;
}

const NAVIGATION_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
]);

function eventKeyFor(modifier: ModifierKey): string {
  switch (modifier) {
    case "Ctrl":
      return "Control";
    case "Meta":
      return "Meta";
    case "Alt":
      return "Alt";
    default:
      return Platform.isMacOS ? "Meta" : "Control";
  }
}

/**
 * Watches the modifier key and arrow keys in every window the plugin is live in.
 *
 * Capture phase is required: Obsidian's keymap consumes arrow keys inside open
 * suggesters, so a bubbling listener would never see them. Reading them here
 * lets auto match back off while the user is navigating by hand.
 *
 * Popout windows are separate realms with their own `document`, so the body
 * class that reveals the badges has to be set per document, and the listeners
 * have to be added per window. One shared `down` flag is enough: the modifier is
 * a physical key, and pressing it should light up every window at once.
 */
export class ModifierTracker {
  private modifierKey = "";
  private down = false;
  private readonly docs = new Set<Document>();

  private readonly onKeyDown = (evt: KeyboardEvent): void => {
    if (NAVIGATION_KEYS.has(evt.key)) this.onNavigate();
    if (evt.key === this.modifierKey && !this.down) this.setDown(true);
  };

  private readonly onKeyUp = (evt: KeyboardEvent): void => {
    if (evt.key === this.modifierKey && this.down) this.setDown(false);
  };

  private readonly onBlur = (): void => {
    if (this.down) this.setDown(false);
  };

  constructor(
    private readonly primaryDoc: Document,
    modifier: ModifierKey,
    private readonly onNavigate: () => void,
  ) {
    this.modifierKey = eventKeyFor(modifier);
  }

  /** Start tracking in the main window. */
  start(): void {
    this.attachDocument(this.primaryDoc);
  }

  /**
   * Track one more document (a popout). Idempotent: the same document is only
   * wired once, no matter how many surfaces open in it.
   */
  attachDocument(doc: Document): void {
    // Electron does not fire `pagehide` when a popout closes (measured), so the
    // only reliable signal is `Window.closed` / a null `defaultView`. Sweeping
    // here is lazy: a closed window is released on the next surface opened, not
    // at the moment it closes. See decision 0016.
    this.sweepClosed();

    if (this.docs.has(doc)) return;
    const win = doc.defaultView;
    if (!win || win.closed) return;

    this.docs.add(doc);
    win.addEventListener("keydown", this.onKeyDown, true);
    win.addEventListener("keyup", this.onKeyUp, true);
    win.addEventListener("blur", this.onBlur);
    // A surface can open while the modifier is already held. The body can be
    // gone already if the window is tearing down.
    if (this.down) bodyOf(doc)?.addClass(MODIFIER_BODY_CLASS);
  }

  /** Drop every document whose window has been closed. */
  private sweepClosed(): void {
    for (const doc of Array.from(this.docs)) {
      const win = doc.defaultView;
      // `defaultView` goes null once the renderer tears the document down; a
      // window that is merely closing reports `closed === true`.
      if (!win || win.closed) this.detachDocument(doc);
    }
  }

  /** Stop tracking one document, e.g. after its window went away. */
  detachDocument(doc: Document): void {
    if (!this.docs.delete(doc)) return;
    const win = doc.defaultView;
    win?.removeEventListener("keydown", this.onKeyDown, true);
    win?.removeEventListener("keyup", this.onKeyUp, true);
    win?.removeEventListener("blur", this.onBlur);
    bodyOf(doc)?.removeClass(MODIFIER_BODY_CLASS);
  }

  stop(): void {
    // Detach first: every detach clears its own body class, and a body that is
    // already gone must not stop the remaining windows from being released.
    for (const doc of Array.from(this.docs)) {
      try {
        this.detachDocument(doc);
      } catch {
        // Keep releasing the others; a half-dead document is not a reason to
        // leave listeners in the rest.
      }
    }
    this.down = false;
  }

  setModifier(modifier: ModifierKey): void {
    this.modifierKey = eventKeyFor(modifier);
    this.setDown(false);
  }

  /** Number of documents currently tracked; used by tests and debug output. */
  documentCount(): number {
    return this.docs.size;
  }

  private setDown(value: boolean): void {
    this.down = value;
    for (const doc of this.docs) bodyOf(doc)?.toggleClass(MODIFIER_BODY_CLASS, value);
  }
}
