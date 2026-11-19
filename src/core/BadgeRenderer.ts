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
 *
 * The numbering comes from the context's own list of pickable rows, so the
 * digit on a row and the row that `Ctrl+N` opens are the same row. Deciding
 * "what is a result" twice made them drift apart.
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

  /**
   * Rows that can actually be picked, in the order the numbers run.
   *
   * The context decides; this method only takes what it hands out. A row
   * that cannot be chosen — a group header, an empty-state row, the "press
   * Enter to create" placeholder — never gets a number, because a number
   * promises a shortcut and the shortcut would do something else.
   */
  private selectableRows(context: SuggestionContext): HTMLElement[] {
    const rows: HTMLElement[] = [];
    for (const pair of context.getSelectableRows()) {
      if (pair.row) rows.push(pair.row);
    }
    return rows;
  }
}
