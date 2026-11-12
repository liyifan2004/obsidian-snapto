#!/usr/bin/env node
/**
 * Refuse to publish internal material.
 *
 *   node scripts/check-public.mjs
 *
 * Inspects what would go out — the commits not yet on the upstream branch, or
 * every tracked file when there is no upstream — and exits 1 if anything looks
 * like advisory notes, local tooling or credentials.
 *
 * Run it before pushing. It is also wired to `prepublishOnly`.
 *
 * This is a backstop. The rule that actually works is that internal documents
 * live outside the repository, under _internal/<project>/ next to it.
 */
import { execFileSync } from "node:child_process";

const RULES = [
  { test: (f) => /^docs\/TASKS-.*\.md$/i.test(f), why: "advisory task list" },
  { test: (f) => /^docs\/REVIEW-.*\.md$/i.test(f), why: "review report" },
  { test: (f) => /^docs\/.*-INTERNAL\.md$/i.test(f), why: "internal note" },
  { test: (f) => /^internal\//.test(f), why: "internal directory" },
  { test: (f) => /\.local\.md$/i.test(f), why: "local-only note" },
  { test: (f) => /^\.workbuddy\//.test(f), why: "agent workspace" },
  { test: (f) => /\.ps1$/i.test(f), why: "machine-specific operations script" },
  { test: (f) => /(^|\/)\.env/.test(f), why: "environment file" },
  { test: (f) => /token|secret|credential/i.test(f), why: "credential-looking name" },
];

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

/**
 * What a push would actually publish: the files in HEAD, plus anything staged.
 *
 * Deletions are excluded on purpose — removing an internal file must not trip
 * the gate that exists to catch adding one.
 */
function filesInScope() {
  const staged = git(["diff", "--cached", "--name-only", "--diff-filter=d"]);
  let head = "";
  try {
    head = git(["ls-tree", "-r", "--name-only", "HEAD"]);
  } catch {
    // No commits yet: the index is all there is.
  }
  const files = new Set(
    [...head.split("\n"), ...staged.split("\n")].map((line) => line.trim()).filter(Boolean),
  );
  return { source: "HEAD plus staged files", files: [...files] };
}

let scope;
try {
  scope = filesInScope();
} catch {
  console.error("check-public: not a git repository, or git is unavailable.");
  process.exit(1);
}

const hits = [];
for (const file of scope.files) {
  for (const rule of RULES) {
    if (rule.test(file)) {
      hits.push({ file, why: rule.why });
      break;
    }
  }
}

if (hits.length === 0) {
  console.log(`check-public: clean (${scope.source}, ${scope.files.length} files).`);
  process.exit(0);
}

console.error(`check-public: ${hits.length} file(s) must not be published:\n`);
for (const hit of hits) console.error(`  ${hit.file}  — ${hit.why}`);
console.error("\nMove internal material outside the repository (see docs/DEVELOPMENT.md) and stage the removal.");
process.exit(1);
