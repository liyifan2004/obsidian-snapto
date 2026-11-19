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

  it("keeps the number display mode the user chose", () => {
    for (const mode of ["off", "on-modifier", "always", "keys-only"] as const) {
      expect(normalizeSettings({ numberDisplay: mode }).numberDisplay).toBe(mode);
    }
  });

  it("falls back to a valid mode for an unknown one", () => {
    expect(normalizeSettings({ numberDisplay: "nonsense" }).numberDisplay).toBe("on-modifier");
  });

  it("migrates the three old number settings into one", () => {
    // The old settings could disagree with each other. The digits were only
    // drawn when the keys worked, so the pairs below are what the user
    // actually saw.
    expect(
      normalizeSettings({ quickSelectEnabled: true, showBadges: true, badgeStyle: "always" })
        .numberDisplay,
    ).toBe("always");
    expect(
      normalizeSettings({ quickSelectEnabled: true, showBadges: true, badgeStyle: "on-modifier" })
        .numberDisplay,
    ).toBe("on-modifier");
    expect(
      normalizeSettings({ quickSelectEnabled: true, showBadges: false }).numberDisplay,
    ).toBe("keys-only");
    expect(
      normalizeSettings({ quickSelectEnabled: false, showBadges: true }).numberDisplay,
    ).toBe("off");
    expect(
      normalizeSettings({ quickSelectEnabled: false, showBadges: false }).numberDisplay,
    ).toBe("off");
  });

  it("prefers the new setting over the old ones", () => {
    const settings = normalizeSettings({
      numberDisplay: "keys-only",
      quickSelectEnabled: true,
      showBadges: true,
    });
    expect(settings.numberDisplay).toBe("keys-only");
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
