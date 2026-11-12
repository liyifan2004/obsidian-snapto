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
 * Watches the modifier key and arrow keys at the window level.
 *
 * Capture phase is required: Obsidian's keymap consumes arrow keys inside open
 * suggesters, so a bubbling listener would never see them. Reading them here
 * lets auto match back off while the user is navigating by hand.
 */
export class ModifierTracker {
  private modifierKey = "";
  private down = false;
  private attached = false;

  private readonly onKeyDown = (evt: KeyboardEvent): void => {
    if (NAVIGATION_KEYS.has(evt.key)) this.onNavigate();
    if (evt.key === this.modifierKey && !this.down) {
      this.down = true;
      this.doc.body.addClass(MODIFIER_BODY_CLASS);
    }
  };

  private readonly onKeyUp = (evt: KeyboardEvent): void => {
    if (evt.key === this.modifierKey && this.down) {
      this.down = false;
      this.doc.body.removeClass(MODIFIER_BODY_CLASS);
    }
  };

  private readonly onBlur = (): void => {
    this.down = false;
    this.doc.body.removeClass(MODIFIER_BODY_CLASS);
  };

  constructor(
    private readonly doc: Document,
    modifier: ModifierKey,
    private readonly onNavigate: () => void,
  ) {
    this.modifierKey = eventKeyFor(modifier);
  }

  start(): void {
    if (this.attached) return;
    this.attached = true;
    this.doc.defaultView?.addEventListener("keydown", this.onKeyDown, true);
    this.doc.defaultView?.addEventListener("keyup", this.onKeyUp, true);
    this.doc.defaultView?.addEventListener("blur", this.onBlur);
  }

  stop(): void {
    if (!this.attached) return;
    this.attached = false;
    this.doc.defaultView?.removeEventListener("keydown", this.onKeyDown, true);
    this.doc.defaultView?.removeEventListener("keyup", this.onKeyUp, true);
    this.doc.defaultView?.removeEventListener("blur", this.onBlur);
    this.doc.body.removeClass(MODIFIER_BODY_CLASS);
  }

  setModifier(modifier: ModifierKey): void {
    this.modifierKey = eventKeyFor(modifier);
    this.down = false;
    this.doc.body.removeClass(MODIFIER_BODY_CLASS);
  }
}
