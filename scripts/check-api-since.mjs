#!/usr/bin/env node
/**
 * Check that every documented Obsidian API the plugin uses exists in the
 * version the manifest asks for.
 *
 *   node scripts/check-api-since.mjs
 *
 * The problem this exists for: `manifest.json` says `minAppVersion: 1.5.0`,
 * and `Plugin.onExternalSettingsChange` is `@since 1.5.7`. Nothing in the
 * build noticed, because the plugin *implements* that method rather than
 * calling it — the host guards the call — so the feature is quietly missing
 * on the versions between the two.
 *
 * The check is deliberately narrow. It cannot see every API a plugin uses;
 * it sees the ones `obsidian.d.ts` annotates with `@since`, and it only
 * complains when the plugin *calls* or *implements* one that arrived after
 * `minAppVersion`.
 *
 * An API that is newer than the floor is not automatically wrong — the
 * plugin may guard the call, or the method may be optional. What cannot be
 * right is an unrecorded one: the compatibility table then claims a
 * guarantee the code does not make.
 *
 * Run it before pushing. It is wired to `prepublishOnly` through
 * `check:public`? No — it is its own command, and `verify` runs it.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Compare two dotted versions: -1, 0 or 1. */
function compareVersions(a, b) {
  const left = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const right = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

function readManifest() {
  return JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
}

/**
 * Every `@since` annotation in the typings, with the member it belongs to.
 *
 * The annotation sits in the doc comment above the member, so the member
 * name is the next line that looks like a declaration.
 */
function collectSinceAnnotations(typings) {
  const found = new Map();
  const lines = typings.split("\n");

  for (let i = 0; i < lines.length; i += 1) {
    const match = /@since\s+(\d+\.\d+(?:\.\d+)?)/.exec(lines[i]);
    if (!match) continue;

    // The member is declared on one of the next few lines. It can be a
    // method (`foo(): void`) or a property signature (`foo?(): any`).
    for (let j = i + 1; j < Math.min(i + 6, lines.length); j += 1) {
      const declaration = /^\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*\??\s*(?:\(|:|;)/.exec(lines[j]);
      if (declaration) {
        const name = declaration[1];
        // Keep the earliest annotation for a name: the first one is the
        // version the API appeared in.
        if (!found.has(name) || compareVersions(match[1], found.get(name)) < 0) {
          found.set(name, match[1]);
        }
        break;
      }
    }
  }
  return found;
}

/**
 * Names the plugin uses, read from its own source.
 *
 * Two shapes matter: a call (`this.foo(`) and an override (`async foo()`).
 * An override is a use too — the host calls the method, so the plugin has to
 * provide it, and if the host only calls it from 1.5.7 on, the plugin's
 * override is dead code before that.
 */
function collectUsedApi() {
  const sources = ["src/main.ts"];
  const used = new Set();

  for (const file of sources) {
    const text = readFileSync(join(ROOT, file), "utf8");
    // Method calls on the plugin instance or on `this`.
    for (const match of text.matchAll(/\b(?:this|plugin)\.([A-Za-z_$][\w$]*)\s*\(/g)) {
      used.add(match[1]);
    }
    // Overrides: a method the plugin defines on the Plugin subclass.
    for (const match of text.matchAll(/^\s{2}(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/gm)) {
      used.add(match[1]);
    }
  }
  return used;
}

/**
 * APIs that are newer than `minAppVersion` and are known to be safe.
 *
 * Each entry has to say *why* it is safe, so the list is a decision record
 * rather than a suppression pile. An entry without a reason is not accepted.
 */
const RECORDED_GAPS = {
  "onExternalSettingsChange":
    "Implemented, not called: the host guards the call with `this.onExternalSettingsChange &&`, so on 1.5.0-1.5.6 the feature is absent and nothing breaks. Recorded in docs/API_COMPATIBILITY.md.",
};

const manifest = readManifest();
const floor = manifest.minAppVersion;
const typingsPath = join(ROOT, "node_modules", "obsidian", "obsidian.d.ts");

let typings;
try {
  typings = readFileSync(typingsPath, "utf8");
} catch {
  console.error(`check-api-since: cannot read ${typingsPath}`);
  console.error("check-api-since: run npm install first");
  process.exit(1);
}

const since = collectSinceAnnotations(typings);
const used = collectUsedApi();

const problems = [];
for (const name of used) {
  const introduced = since.get(name);
  if (!introduced) continue;
  if (compareVersions(introduced, floor) <= 0) continue;
  if (RECORDED_GAPS[name]) continue;
  problems.push({
    name,
    introduced,
    floor,
  });
}

// A recorded gap without a reason is worse than no record: it looks like a
// decision and is not one.
for (const [name, reason] of Object.entries(RECORDED_GAPS)) {
  if (!reason || reason.trim().length < 20) {
    console.error(`check-api-since: ${name} is recorded as a gap but says no reason.`);
    process.exit(1);
  }
}

if (problems.length === 0) {
  const recorded = Object.keys(RECORDED_GAPS).length;
  const suffix = recorded > 0 ? `, ${recorded} recorded gap(s)` : "";
  console.log(`check-api-since: clean (minAppVersion ${floor}${suffix}).`);
  process.exit(0);
}

console.error(`check-api-since: ${problems.length} API(s) newer than minAppVersion ${floor}:`);
for (const problem of problems) {
  console.error(`  ${problem.name} — @since ${problem.introduced}`);
}
console.error("");
console.error("Either raise minAppVersion, or guard the call and record the gap in");
console.error("docs/API_COMPATIBILITY.md. An unrecorded newer API is the problem: the");
console.error("table would otherwise promise a guarantee the code does not make.");
process.exit(1);
