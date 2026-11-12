import type { MatchHit, MatchLevel, MatchOptions } from "../types";

/**
 * Match levels, strongest first. The order is load-bearing: it decides which
 * hit wins when several candidates answer the same query.
 */
export const MATCH_LEVELS: readonly MatchLevel[] = [
  "exact",
  "normalized",
  "prefix",
  "contains",
  "fuzzy",
];

export const LEVEL_RANK: Record<MatchLevel, number> = {
  exact: 0,
  normalized: 1,
  prefix: 2,
  contains: 3,
  fuzzy: 4,
};

export const BASE_SCORE: Record<MatchLevel, number> = {
  exact: 1000,
  normalized: 900,
  prefix: 800,
  contains: 700,
  fuzzy: 500,
};

export const DEFAULT_MATCH_OPTIONS: MatchOptions = {
  // Contains by default. Chinese titles have no word boundaries, so a title
  // written `会议纪要 2026` should answer `纪要`. Auto *confirm* has its own
  // guard (`isConfidentLevel`), so a loose floor never opens the wrong note.
  minLevel: "contains",
  normalizeWidth: true,
  ignoreCase: true,
  ignoreSeparators: true,
};

const SEPARATOR_PATTERN = /[\s\-_·.]+/g;

/**
 * Canonical form used by every level except `exact`.
 *
 * NFKC folds full-width ASCII (ＡＢＣ, １２３) into plain ASCII while leaving
 * CJK characters untouched, which is what Chinese users expect: a title written
 * with a full-width colon should still answer a half-width query.
 */
export function normalize(value: string, options: MatchOptions): string {
  let out = options.normalizeWidth ? value.normalize("NFKC") : value;
  if (options.ignoreCase) out = out.toLowerCase();
  return options.ignoreSeparators ? out.replace(SEPARATOR_PATTERN, "") : out.trim();
}

/** True when `needle` appears inside `haystack` in order, gaps allowed. */
export function isSubsequence(needle: string, haystack: string): boolean {
  if (needle.length === 0) return true;
  if (needle.length > haystack.length) return false;
  let cursor = 0;
  for (const char of haystack) {
    if (char === needle[cursor]) {
      cursor += 1;
      if (cursor === needle.length) return true;
    }
  }
  return false;
}

/**
 * Score for a fuzzy hit: reward contiguous runs, punish long gaps. Scores are
 * only compared between candidates of the same query, never across queries.
 */
function fuzzyScore(needle: string, haystack: string): number {
  let score = 0;
  let cursor = 0;
  let run = 0;
  for (let i = 0; i < haystack.length && cursor < needle.length; i += 1) {
    if (haystack[i] === needle[cursor]) {
      run += 1;
      score += 2 + run;
      cursor += 1;
    } else {
      run = 0;
      score -= 1;
    }
  }
  return score;
}

/** Classify one candidate against one query. `query` is already trimmed. */
export function classify(
  text: string,
  query: string,
  normalizedQuery: string,
  options: MatchOptions,
): { level: MatchLevel; score: number } | null {
  if (query.length === 0) return null;

  if (text === query) return { level: "exact", score: BASE_SCORE.exact };

  const normalizedText = normalize(text, options);
  if (normalizedText.length === 0) return null;

  if (normalizedText === normalizedQuery) {
    return {
      level: "normalized",
      score: BASE_SCORE.normalized - Math.abs(text.length - query.length),
    };
  }

  if (normalizedText.startsWith(normalizedQuery)) {
    return {
      level: "prefix",
      score: BASE_SCORE.prefix - (normalizedText.length - normalizedQuery.length),
    };
  }

  const position = normalizedText.indexOf(normalizedQuery);
  if (position >= 0) {
    return {
      level: "contains",
      score: BASE_SCORE.contains - position * 4 - (normalizedText.length - normalizedQuery.length),
    };
  }

  if (isSubsequence(normalizedQuery, normalizedText)) {
    return { level: "fuzzy", score: BASE_SCORE.fuzzy + fuzzyScore(normalizedQuery, normalizedText) };
  }

  return null;
}

/** All hits for one query, strongest first. Ties keep the list's own order. */
export function matchAll(
  texts: readonly string[],
  query: string,
  options: MatchOptions = DEFAULT_MATCH_OPTIONS,
): MatchHit[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const normalizedQuery = normalize(trimmed, options);
  if (normalizedQuery.length === 0) return [];

  const hits: MatchHit[] = [];
  for (let index = 0; index < texts.length; index += 1) {
    const text = texts[index];
    if (text === undefined) continue;
    const result = classify(text, trimmed, normalizedQuery, options);
    if (!result) continue;
    if (!meetsMinLevel(result.level, options.minLevel)) continue;
    hits.push({ index, text, level: result.level, score: result.score });
  }

  hits.sort((a, b) => {
    const byLevel = LEVEL_RANK[a.level] - LEVEL_RANK[b.level];
    if (byLevel !== 0) return byLevel;
    if (a.score !== b.score) return b.score - a.score;
    return a.index - b.index;
  });

  return hits;
}

/** Whether a level is at least as strong as the configured floor. */
export function meetsMinLevel(level: MatchLevel, minLevel: MatchLevel): boolean {
  return LEVEL_RANK[level] <= LEVEL_RANK[minLevel];
}

/** What to do when more than one candidate matches equally well. */
export type ConflictPolicy = "unique" | "first" | "last" | "none";

/**
 * Pick the single winner, or nothing.
 *
 * `unique` is the default because two files with the same name in different
 * folders is the normal case in a vault, and guessing between them makes the
 * plugin feel broken. Only a tie at the *strongest* level counts: one exact hit
 * beats any number of prefix hits.
 */
export function resolveConflict(hits: readonly MatchHit[], policy: ConflictPolicy): MatchHit | null {
  const best = hits[0];
  if (!best || policy === "none") return null;

  const tie = hits.filter((hit) => LEVEL_RANK[hit.level] === LEVEL_RANK[best.level]);
  if (policy === "first") return tie[0] ?? null;
  if (policy === "last") return tie[tie.length - 1] ?? null;
  return tie.length === 1 ? tie[0] ?? null : null;
}

/**
 * Levels strong enough to act without asking.
 *
 * A prefix or substring hit means "one of these probably answers you"; an exact
 * or normalized hit means "this is the thing you named". Auto confirm is only
 * allowed in the second case, otherwise typing `note` would open `notebook.md`.
 */
export function isConfidentLevel(level: MatchLevel): boolean {
  return level === "exact" || level === "normalized";
}
