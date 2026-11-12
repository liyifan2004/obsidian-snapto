import type { SuggestionContext } from "./SuggestionContext";

export const BADGE_CLASS = "snapto-index";
export const BADGE_ALWAYS_CLASS = "is-always";
export const MAX_BADGES = 9;

/**
 * Draws 1..9 next to the first nine rows.
 *
 * Badges are real elements rather than CSS counters because Obsidian's list
 * markup belongs to other plugins: styling `.suggestion-item` from our sheet
 * would leak into every third-party suggester. A span we own and remove is
 * narrower, and it also gives us an exact handle for cleanup.
 */
export class BadgeRenderer {
  /** Add or refresh badges. Safe to call on every list mutation. */
  apply(context: SuggestionContext, alwaysVisible: boolean): void {
    const rows = this.selectableRows(context);
    for (let i = 0; i < Math.min(MAX_BADGES, rows.length); i += 1) {
      const row = rows[i];
      if (!row) continue;
      const label = String(i + 1);
      const existing = row.querySelector<HTMLElement>(`:scope > .${BADGE_CLASS}`);
      if (existing) {
        if (existing.textContent !== label) existing.setText(label);
        existing.toggleClass(BADGE_ALWAYS_CLASS, alwaysVisible);
        continue;
      }
      const badge = createSpan({ cls: BADGE_CLASS, text: label });
      if (alwaysVisible) badge.addClass(BADGE_ALWAYS_CLASS);
      row.appendChild(badge);
    }
    // Rows that scrolled past nine keep no badge.
    for (let i = MAX_BADGES; i < rows.length; i += 1) {
      rows[i]?.querySelector<HTMLElement>(`:scope > .${BADGE_CLASS}`)?.remove();
    }
  }

  clear(context: SuggestionContext): void {
    for (const badge of Array.from(context.containerEl.querySelectorAll<HTMLElement>(`.${BADGE_CLASS}`))) {
      badge.remove();
    }
  }

  private selectableRows(context: SuggestionContext): HTMLElement[] {
    const rows: HTMLElement[] = [];
    for (const row of context.getRows()) {
      if (!row.hasClass("mod-group") && !row.hasClass("suggestion-empty")) rows.push(row);
    }
    return rows;
  }
}
