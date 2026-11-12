/**
 * Runtime smoke check against a running Obsidian instance.
 *
 *   # start a throwaway instance first, for example:
 *   #   Obsidian.exe --remote-debugging-port=9333 --user-data-dir=<scratch dir>
 *   node scripts/runtime-check.mjs --port 9333 --query "e" --expect "Meeting Notes"
 *
 * Requires the plugin to be installed and enabled in the vault that instance
 * has open, and a note matching --expect to exist.
 *
 * Prints JSON. Exits non-zero when a check fails, so it can gate a release.
 */
import http from "node:http";

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : fallback;
}

const PORT = Number(arg("port", "9333"));
const QUERY = String(arg("query", "e"));
const EXPECT = arg("expect", null);

function listPages() {
  return new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${PORT}/json/list`, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve(JSON.parse(body)));
      })
      .on("error", reject);
  });
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let nextId = 0;
    const pending = new Map();

    socket.onopen = () =>
      resolve({
        send(method, params) {
          const id = (nextId += 1);
          return new Promise((res, rej) => {
            pending.set(id, { res, rej });
            socket.send(JSON.stringify({ id, method, params }));
          });
        },
        close: () => socket.close(),
      });

    socket.onerror = () => reject(new Error("devtools socket failed"));
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (message.error) entry.rej(new Error(JSON.stringify(message.error)));
      else entry.res(message.result);
    };
  });
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
    throw new Error(`evaluate failed: ${detail}`);
  }
  return result.result.value;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const checks = [];
const record = (name, pass, detail) => checks.push({ name, pass, detail });

const pages = await listPages();
const main = pages.find((page) => page.type === "page" && page.url.includes("index.html"));
if (!main) throw new Error("no Obsidian window found on port " + PORT);

const client = await connect(main.webSocketDebuggerUrl);
const ev = (expression) => evaluate(client, expression);

const wiring = await ev(
  `(() => {
     const p = app.plugins.plugins["snapto"];
     return p ? { patched: p.patcher.installed, version: p.manifest.version } : null;
   })()`,
);
record("plugin loaded and prototypes wrapped", Boolean(wiring?.patched), wiring);

await ev(`(() => { app.commands.executeCommandById("switcher:open"); return true; })()`);
await sleep(350);
await ev(
  `(() => {
     const input = document.querySelector(".prompt-input");
     input.value = ${JSON.stringify(QUERY)};
     input.dispatchEvent(new Event("input", { bubbles: true }));
     return true;
   })()`,
);
await sleep(450);

const list = await ev(
  `(() => {
     const p = app.plugins.plugins["snapto"];
     const context = p.contexts.active();
     return {
       scene: context ? context.scene : null,
       rows: document.querySelectorAll(".prompt-results > .suggestion-item").length,
       badges: document.querySelectorAll(".snapto-index").length,
       shortcuts: p.shortcuts.count(),
       candidates: context ? context.getCandidates().map((c) => c.text) : [],
     };
   })()`,
);
record("scene detected", list.scene !== null, list.scene);
record("badges rendered", list.badges > 0, `${list.badges} badges for ${list.rows} rows`);
record("shortcuts registered", list.shortcuts === 1, list.shortcuts);

if (EXPECT) {
  const target = list.candidates.indexOf(EXPECT);
  if (target < 0) {
    record(`"${EXPECT}" present in results`, false, list.candidates);
  } else {
    const opened = await ev(
      `(async () => {
         window.dispatchEvent(new KeyboardEvent("keydown", {
           key: "${target + 1}", code: "Digit${target + 1}", ctrlKey: true, bubbles: true, cancelable: true
         }));
         await new Promise((resolve) => setTimeout(resolve, 400));
         return { active: app.workspace.getActiveFile()?.basename ?? null, closed: !document.querySelector(".prompt") };
       })()`,
    );
    record("shortcut opened the expected note", opened.active === EXPECT, opened);
  }
}

const settings = await ev(
  `(() => {
     const p = app.plugins.plugins["snapto"];
     return { scenes: Object.keys(p.settings.scenes).length, delay: p.settings.delayMs };
   })()`,
);
record("settings loaded", settings.scenes > 0, settings);

client.close();

const failed = checks.filter((check) => !check.pass);
console.log(JSON.stringify({ checks, failed: failed.length }, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
