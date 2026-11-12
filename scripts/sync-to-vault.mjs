/**
 * Copy the built plugin into a vault so it can be loaded from Obsidian.
 *
 *   node scripts/sync-to-vault.mjs "<vault-path>"
 *
 * Only the three files Obsidian reads are copied. `data.json` holds user
 * settings and must never be overwritten from here.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = ["main.js", "manifest.json", "styles.css"];

const vaultArg = process.argv[2];
if (!vaultArg) {
  console.error("usage: node scripts/sync-to-vault.mjs <vault-path>");
  process.exit(1);
}

const vault = resolve(vaultArg);
if (!existsSync(join(vault, ".obsidian"))) {
  console.error(`not an Obsidian vault (missing .obsidian): ${vault}`);
  process.exit(1);
}

const target = join(vault, ".obsidian", "plugins", "snapto");
mkdirSync(target, { recursive: true });

for (const file of FILES) {
  const source = join(root, file);
  if (!existsSync(source)) {
    console.error(`missing build output: ${file}. Run "npm run build" first.`);
    process.exit(1);
  }
  copyFileSync(source, join(target, file));
  console.log(`copied ${file} -> ${target}`);
}

console.log("\nReload Obsidian (Ctrl+R) and enable SnapTo in Settings > Community plugins.");
