/**
 * Shared vocabulary for the whole plugin. Everything here is DOM-free and
 * Obsidian-free on purpose, so the core modules stay testable without the app.
 */

/**
 * A search surface the plugin knows how to drive.
 *
 * Only surfaces with a working adapter live here. Candidates that were studied
 * and rejected (global search panel, in-note find, native outline) are recorded
 * in `docs/FEATURE_MATRIX.md` instead of being listed with a fake status.
 */
export type SceneId =
  | "quick-switcher"
  | "command-palette"
  | "plugin-modal"
  | "editor-suggest"
  | "popover-suggest";

/** How well a candidate answers the typed query. Ordered from strongest. */
export type MatchLevel = "exact" | "normalized" | "prefix" | "contains" | "fuzzy";

export interface MatchOptions {
  /** Lowest level that still counts as a hit. */
  minLevel: MatchLevel;
  /** Treat full-width digits/punctuation as their ASCII counterparts. */
  normalizeWidth: boolean;
  /** Ignore case when comparing. */
  ignoreCase: boolean;
  /** Ignore spaces, hyphens, underscores and dots when comparing. */
  ignoreSeparators: boolean;
}

export interface MatchHit {
  /** Index inside the candidate array handed to the engine. */
  index: number;
  level: MatchLevel;
  /** Higher is better. Only comparable within one query. */
  score: number;
  /** The text that actually matched. */
  text: string;
}

/** One row of a suggestion list. */
export interface Candidate {
  index: number;
  /** Primary text used for matching, already cleaned of list decoration. */
  text: string;
  /** Original value handed back to the host list (TFile, Command, string...). */
  raw: unknown;
}

/**
 * A live search surface. Obtained from an adapter, valid until `isAlive()`
 * turns false. All methods must be safe to call on a dead context.
 */
export interface SearchContext {
  readonly id: string;
  readonly scene: SceneId;
  /** Element holding the clickable rows. */
  readonly containerEl: HTMLElement;
  readonly inputEl: HTMLElement | null;
  getQuery(): string;
  getCandidates(): Candidate[];
  /**
   * Rows the user can pick, in the order the numbers run.
   *
   * The single source of truth for "what is a result". The badges are
   * numbered from it and the number shortcuts read from it, so the digit on a
   * row and the row that `Ctrl+N` opens are the same row by construction.
   */
  getSelectableRows(): Array<{ index: number; row: HTMLElement | undefined }>;
  getSelectedIndex(): number;
  /** Move the highlight only. Does not confirm the choice. */
  setSelectedIndex(index: number, source?: Event): void;
  /**
   * Confirm a row the way the host would on click / Enter.
   *
   * `source` is the key event behind the choice. Hosts read the modifier
   * flags off it to decide between replacing the current leaf and opening a
   * new tab, so it has to travel with the confirmation.
   */
  commit(index: number, source?: Event): void;
  isAlive(): boolean;
  /** True when the highlight was moved by hand within the last `withinMs`. */
  wasManuallyMoved(withinMs: number): boolean;
}
