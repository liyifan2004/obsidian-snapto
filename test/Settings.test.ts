import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  DELAY_MAX_MS,
  DELAY_MIN_MS,
  SCENE_IDS,
  normalizeSettings,
} from "../src/settings/DefaultSettings";

describe("normalizeSettings", () => {
  it("returns defaults for null input", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it("returns defaults for non-object input", () => {
    expect(normalizeSettings("nonsense")).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(42)).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid user values", () => {
    const settings = normalizeSettings({ delayMs: 2500, modifier: "Alt", matchLevel: "prefix" });
    expect(settings.delayMs).toBe(2500);
    expect(settings.modifier).toBe("Alt");
    expect(settings.matchLevel).toBe("prefix");
  });

  it("treats false and zero as real values, not as missing", () => {
    const settings = normalizeSettings({
      autoMatchEnabled: false,
      ignoreCase: false,
      debug: false,
      delayMs: 0,
    });
    expect(settings.autoMatchEnabled).toBe(false);
    expect(settings.ignoreCase).toBe(false);
    expect(settings.debug).toBe(false);
    expect(settings.delayMs).toBe(DELAY_MIN_MS);
  });

  it("clamps the delay into the allowed range", () => {
    expect(normalizeSettings({ delayMs: 99999 }).delayMs).toBe(DELAY_MAX_MS);
    expect(normalizeSettings({ delayMs: -5 }).delayMs).toBe(DELAY_MIN_MS);
    expect(normalizeSettings({ delayMs: Number.NaN }).delayMs).toBe(DEFAULT_SETTINGS.delayMs);
  });

  it("rejects unknown enum values", () => {
    const settings = normalizeSettings({ modifier: "Hyper", conflictPolicy: "coin-flip" });
    expect(settings.modifier).toBe(DEFAULT_SETTINGS.modifier);
    expect(settings.conflictPolicy).toBe(DEFAULT_SETTINGS.conflictPolicy);
  });

  it("fills missing scenes and ignores unknown ones", () => {
    const settings = normalizeSettings({ scenes: { "quick-switcher": { enabled: false }, ghost: {} } });
    expect(settings.scenes["quick-switcher"].enabled).toBe(false);
    expect(settings.scenes["command-palette"].enabled).toBe(true);
    expect(Object.keys(settings.scenes).sort()).toEqual([...SCENE_IDS].sort());
  });

  it("survives a scenes object of the wrong shape", () => {
    const settings = normalizeSettings({ scenes: "all" });
    expect(settings.scenes["editor-suggest"].enabled).toBe(true);
  });
});
