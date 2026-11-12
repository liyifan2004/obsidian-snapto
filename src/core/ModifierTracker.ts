import { Platform } from "obsidian";
import type { ModifierKey } from "../settings/DefaultSettings";

export const MODIFIER_BODY_CLASS = "snapto-modifier-down";

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

  /** A closed popout must stop holding a reference and stop receiving classes. */
  private readonly onPageHide = (evt: Event): void => {
    const target = evt.target as { document?: Document } | null;
    const doc = target?.document;
    if (doc) this.detachDocument(doc);
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
    if (this.docs.has(doc)) return;
    const win = doc.defaultView;
    if (!win) return;

    this.docs.add(doc);
    win.addEventListener("keydown", this.onKeyDown, true);
    win.addEventListener("keyup", this.onKeyUp, true);
    win.addEventListener("blur", this.onBlur);
    // Standard DOM event, no Obsidian API involved. Whether Electron fires it
    // for a popout is checked in the runtime pass, not assumed here.
    win.addEventListener("pagehide", this.onPageHide);
    // A surface can open while the modifier is already held.
    if (this.down) doc.body.addClass(MODIFIER_BODY_CLASS);
  }

  /** Stop tracking one document, e.g. after its window went away. */
  detachDocument(doc: Document): void {
    if (!this.docs.delete(doc)) return;
    const win = doc.defaultView;
    win?.removeEventListener("keydown", this.onKeyDown, true);
    win?.removeEventListener("keyup", this.onKeyUp, true);
    win?.removeEventListener("blur", this.onBlur);
    win?.removeEventListener("pagehide", this.onPageHide);
    doc.body.removeClass(MODIFIER_BODY_CLASS);
  }

  stop(): void {
    this.setDown(false);
    for (const doc of Array.from(this.docs)) this.detachDocument(doc);
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
    for (const doc of this.docs) doc.body.toggleClass(MODIFIER_BODY_CLASS, value);
  }
}
