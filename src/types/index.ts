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
  getSelectedIndex(): number;
  /** Move the highlight only. Does not confirm the choice. */
  setSelectedIndex(index: number): void;
  /** Confirm a row the way the host would on click / Enter. */
  commit(index: number): void;
  isAlive(): boolean;
  /** True when the highlight was moved by hand within the last `withinMs`. */
  wasManuallyMoved(withinMs: number): boolean;
}
