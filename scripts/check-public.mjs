#!/usr/bin/env node
/**
 * Refuse to publish internal material, machine-specific paths or stale numbers.
 *
 *   node scripts/check-public.mjs
 *
 * Scope is what a push would publish: the files in HEAD plus anything staged.
 * Deletions are excluded, so removing an internal file does not trip the gate
 * that exists to catch adding one. An `upstream..HEAD` diff was the obvious
 * alternative and was rejected: it depends on a fresh upstream ref, and checking
 * the final tree is stricter anyway.
 *
 * Three kinds of drift are caught:
 *   1. file names that must never be published
 *   2. local absolute paths and concrete internal paths inside published files
 *   3. the assertion count quoted in docs disagreeing with runtime-check.mjs
 *
 * Run it before pushing. It is wired to `prepublishOnly`, not `prepublish`,
 * because `prepublish` also runs on `npm install`.
 *
 * This is a backstop, not the policy. The policy is that internal documents live
 * outside the repository, in _internal/<project>/ next to it — a file that is not
 * in the working tree cannot be committed by mistake. A gate that runs on your
 * machine also cannot stop a push someone else makes; it stops the one you are
 * about to make.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const NAME_RULES = [
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

// A drive letter is the reliable signal; the directory names below are the ones
// this project actually lives under, which keeps the rule from flagging ordinary
// prose.
const CONTENT_RULES = [
  {
    test: (line) => /\b[A-Z]:[\\/]{1,2}(MyProjects|MyNotes|Users|Obsidian)\b/.test(line),
    why: "absolute local path",
  },
  {
    // A concrete project folder under _internal/ is machine-specific. The
    // placeholders _internal/<project>/ and _internal/_tools/ are how the docs
    // are supposed to describe the layout, so they stay allowed.
    test: (line) => /_internal\/[A-Z][A-Za-z0-9-]*\//.test(line),
    why: "concrete internal path",
  },
];

const TEXT_FILE = /\.(md|mjs|cjs|js|ts|json|yml|yaml|css|txt)$/i;
const ASSERTION_LINE = /(\d+)\s+assertions?\b/;

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

/** What a push would publish: HEAD plus staged, deletions excluded. */
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
  return [...files];
}

/** Committed or staged content, falling back to the working copy. */
function contentOf(file) {
  try {
    return git(["show", `:${file}`]);
  } catch {
    try {
      return readFileSync(file, "utf8");
    } catch {
      return null;
    }
  }
}

const files = filesInScope();
const problems = [];

for (const file of files) {
  for (const rule of NAME_RULES) {
    if (rule.test(file)) {
      problems.push(`${file}  — ${rule.why}`);
      break;
    }
  }
}

for (const file of files) {
  if (!TEXT_FILE.test(file)) continue;
  const content = contentOf(file);
  if (content === null) continue;
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    for (const rule of CONTENT_RULES) {
      if (rule.test(line)) {
        problems.push(`${file}:${i + 1}  — ${rule.why}`);
        break;
      }
    }
  }
}

// The assertion count is quoted in docs; keep it derived rather than remembered.
const script = contentOf("scripts/runtime-check.mjs");
if (script !== null) {
  const actual = (script.match(/\brecord\(/g) || []).length;
  for (const file of files) {
    if (!/^docs\/.*\.md$/.test(file)) continue;
    const content = contentOf(file);
    if (content === null) continue;
    const match = ASSERTION_LINE.exec(content);
    if (!match) continue;
    const quoted = Number(match[1]);
    if (quoted !== actual) {
      problems.push(
        `${file}  — says ${quoted} assertions, scripts/runtime-check.mjs has ${actual} record() calls`,
      );
    }
  }
}

if (problems.length === 0) {
  console.log(`check-public: clean (${files.length} files).`);
  process.exit(0);
}

console.error(`check-public: ${problems.length} problem(s) that must not be published:\n`);
for (const problem of problems) console.error(`  ${problem}`);
console.error("\nInternal material belongs outside the repository (see docs/DEVELOPMENT.md).");
process.exit(1);
