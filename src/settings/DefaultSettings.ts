import type { MatchLevel, SceneId } from "../types";

/** Which physical key opens quick select. `Mod` is Cmd on macOS, Ctrl elsewhere. */
export type ModifierKey = "Mod" | "Ctrl" | "Alt" | "Meta";

/** What happens when auto match finds a winner. */
export type AutoMatchAction = "highlight" | "confirm";

/** How to react when several candidates match equally well. */
export type ConflictPolicy = "unique" | "first" | "last" | "none";

export interface SceneSettings {
  enabled: boolean;
}

export interface BadgeSettings {
  style: "on-modifier" | "always";
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
  quickSelectEnabled: boolean;
  modifier: ModifierKey;
  showBadges: boolean;
  badgeStyle: BadgeSettings["style"];
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
  matchLevel: "prefix",
  normalizeWidth: true,
  ignoreCase: true,
  ignoreSeparators: true,
  conflictPolicy: "unique",
  quickSelectEnabled: true,
  modifier: "Mod",
  showBadges: true,
  badgeStyle: "on-modifier",
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
const BADGE_STYLES: readonly BadgeSettings["style"][] = ["on-modifier", "always"];

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
    quickSelectEnabled: pickBoolean(source.quickSelectEnabled, DEFAULT_SETTINGS.quickSelectEnabled),
    modifier: pickEnum(source.modifier, MODIFIERS, DEFAULT_SETTINGS.modifier),
    showBadges: pickBoolean(source.showBadges, DEFAULT_SETTINGS.showBadges),
    badgeStyle: pickEnum(source.badgeStyle, BADGE_STYLES, DEFAULT_SETTINGS.badgeStyle),
    scenes,
    debug: pickBoolean(source.debug, DEFAULT_SETTINGS.debug),
  };
}
