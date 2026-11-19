import type { MatchLevel, SceneId } from "../types";

/** Which physical key opens quick select. `Mod` is Cmd on macOS, Ctrl elsewhere. */
export type ModifierKey = "Mod" | "Ctrl" | "Alt" | "Meta";

/** What happens when auto match finds a winner. */
export type AutoMatchAction = "highlight" | "confirm";

/** How to react when several candidates match equally well. */
export type ConflictPolicy = "unique" | "first" | "last" | "none";

/**
 * How the result numbers appear.
 *
 * One setting for both halves of the feature, because the halves cannot
 * disagree: a digit on a row is a promise that the number key opens that row.
 *
 * - `off` — no numbers, no number keys.
 * - `on-modifier` — numbers while the modifier is held, and the keys work
 *   whenever they are pressed.
 * - `always` — numbers always on screen; the keys work too.
 * - `keys-only` — the keys work but no digit is ever drawn.
 */
export type NumberDisplay = "off" | "on-modifier" | "always" | "keys-only";

export interface SceneSettings {
  enabled: boolean;
}

export interface SnapToSettings {
  autoMatchEnabled: boolean;
  autoMatchAction: AutoMatchAction;
  delayMs: number;
  matchLevel: MatchLevel;
  normalizeWidth: boolean;
  ignoreCase: boolean;
  ignoreSeparators: boolean;
  conflictPolicy: ConflictPolicy;
  numberDisplay: NumberDisplay;
  modifier: ModifierKey;
  scenes: Record<SceneId, SceneSettings>;
  debug: boolean;
}

export const SCENE_IDS: readonly SceneId[] = [
  "quick-switcher",
  "command-palette",
  "plugin-modal",
  "editor-suggest",
  "popover-suggest",
];

export const DELAY_MIN_MS = 200;
export const DELAY_MAX_MS = 5000;

export const DEFAULT_SETTINGS: SnapToSettings = {
  autoMatchEnabled: true,
  autoMatchAction: "highlight",
  delayMs: 1000,
  matchLevel: "contains",
  normalizeWidth: true,
  ignoreCase: true,
  ignoreSeparators: true,
  conflictPolicy: "unique",
  numberDisplay: "on-modifier",
  modifier: "Mod",
  scenes: {
    "quick-switcher": { enabled: true },
    "command-palette": { enabled: true },
    "plugin-modal": { enabled: true },
    "editor-suggest": { enabled: true },
    "popover-suggest": { enabled: true },
  },
  debug: false,
};

const MODIFIERS: readonly ModifierKey[] = ["Mod", "Ctrl", "Alt", "Meta"];
const ACTIONS: readonly AutoMatchAction[] = ["highlight", "confirm"];
const POLICIES: readonly ConflictPolicy[] = ["unique", "first", "last", "none"];
const LEVELS: readonly MatchLevel[] = ["exact", "normalized", "prefix", "contains", "fuzzy"];
const NUMBER_DISPLAYS: readonly NumberDisplay[] = ["off", "on-modifier", "always", "keys-only"];

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function pickDelay(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(DELAY_MAX_MS, Math.max(DELAY_MIN_MS, Math.round(value)));
}

/**
 * Read the number display mode, migrating the three old settings.
 *
 * The plugin used to have "enable number shortcuts", "show result numbers" and
 * "when to show numbers" as separate controls. They could disagree — the
 * numbers could promise a key that did nothing — so they are one setting
 * now. A settings file written by an older version still has the old three,
 * and this is where they become one.
 */
function pickNumberDisplay(source: Record<string, unknown>): NumberDisplay {
  const direct = source.numberDisplay;
  if (typeof direct === "string" && (NUMBER_DISPLAYS as readonly string[]).includes(direct)) {
    return direct as NumberDisplay;
  }

  // No new value yet: read the old ones.
  const keysEnabled = pickBoolean(source.quickSelectEnabled, true);
  const badgesShown = pickBoolean(source.showBadges, true);
  const oldStyle = source.badgeStyle === "always" ? "always" : "on-modifier";

  if (!keysEnabled) return "off";
  if (!badgesShown) return "keys-only";
  return oldStyle;
}

/**
 * Turn whatever sits in data.json into a complete settings object.
 *
 * Everything is untrusted: missing fields fall back, wrong types fall back,
 * and `0` / `false` are treated as real values rather than as "empty".
 */
export function normalizeSettings(raw: unknown): SnapToSettings {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawScenes = (source.scenes && typeof source.scenes === "object" ? source.scenes : {}) as Record<
    string,
    unknown
  >;

  const scenes = {} as Record<SceneId, SceneSettings>;
  for (const scene of SCENE_IDS) {
    const rawScene = rawScenes[scene];
    const entry = (rawScene && typeof rawScene === "object" ? rawScene : {}) as Record<string, unknown>;
    scenes[scene] = {
      enabled: pickBoolean(entry.enabled, DEFAULT_SETTINGS.scenes[scene].enabled),
    };
  }

  return {
    autoMatchEnabled: pickBoolean(source.autoMatchEnabled, DEFAULT_SETTINGS.autoMatchEnabled),
    autoMatchAction: pickEnum(source.autoMatchAction, ACTIONS, DEFAULT_SETTINGS.autoMatchAction),
    delayMs: pickDelay(source.delayMs, DEFAULT_SETTINGS.delayMs),
    matchLevel: pickEnum(source.matchLevel, LEVELS, DEFAULT_SETTINGS.matchLevel),
    normalizeWidth: pickBoolean(source.normalizeWidth, DEFAULT_SETTINGS.normalizeWidth),
    ignoreCase: pickBoolean(source.ignoreCase, DEFAULT_SETTINGS.ignoreCase),
    ignoreSeparators: pickBoolean(source.ignoreSeparators, DEFAULT_SETTINGS.ignoreSeparators),
    conflictPolicy: pickEnum(source.conflictPolicy, POLICIES, DEFAULT_SETTINGS.conflictPolicy),
    numberDisplay: pickNumberDisplay(source),
    modifier: pickEnum(source.modifier, MODIFIERS, DEFAULT_SETTINGS.modifier),
    scenes,
    debug: pickBoolean(source.debug, DEFAULT_SETTINGS.debug),
  };
}
