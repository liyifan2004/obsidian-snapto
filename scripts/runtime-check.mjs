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

/** Execute the command and wait for the prompt to exist; tolerate a slow start. */
async function openSwitcher() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    // A cold start spends a while indexing before commands can run.
    const ready = await ev(`typeof app !== "undefined" && !!app.commands && !!app.workspace`);
    if (ready) {
      await ev(`(() => { app.commands.executeCommandById("switcher:open"); return true; })()`);
    }
    await sleep(500);
    if (await ev(`!!document.querySelector(".prompt-input")`)) return true;
  }
  return false;
}

if (!(await openSwitcher())) {
  record("quick switcher opened", false, "no .prompt-input after 4 attempts");
  client.close();
  console.log(JSON.stringify({ checks, failed: checks.length }, null, 2));
  process.exit(1);
}
record("quick switcher opened", true, "prompt rendered");

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
     // Same filter production uses; contexts.active() no longer exists.
     const pick = (p) => {
       const all = p.contexts.all();
       for (let i = all.length - 1; i >= 0; i -= 1) {
         const c = all[i];
         if (!c.isAlive()) continue;
         if (p.settings.scenes[c.scene]?.enabled !== true) continue;
         if (c.getCandidates().length === 0) continue;
         return c;
       }
       return null;
     };
     const context = pick(p);
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

// Re-type three times in the quick switcher. It is a SuggestModal, so this
// proves the list rebuild does not spawn contexts; the per-keystroke reopen bug
// lives in PopoverSuggest and is covered by the properties-panel check below.
const afterRetouch = await ev(
  `(async () => {
     const input = document.querySelector(".prompt-input");
     for (let i = 0; i < 3; i += 1) {
       input.value = ${JSON.stringify(QUERY)};
       input.dispatchEvent(new Event("input", { bubbles: true }));
       await new Promise((resolve) => setTimeout(resolve, 60));
     }
     await new Promise((resolve) => setTimeout(resolve, 250));
     const p = app.plugins.plugins["snapto"];
     return { contexts: p.contexts.size(), shortcuts: p.shortcuts.count() };
   })()`,
);
record(
  "quick switcher keeps one context across retypes",
  afterRetouch.contexts === 1 && afterRetouch.shortcuts === 1,
  afterRetouch,
);

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

// Typing the full title must leave that row selected once the idle delay passed.
if (EXPECT) {
  const autoMatch = await ev(
    `(async () => {
       const p = app.plugins.plugins["snapto"];
       // The shortcut check above closed the switcher; open a fresh one.
       app.commands.executeCommandById("switcher:open");
       await new Promise((resolve) => setTimeout(resolve, 350));
       const input = document.querySelector(".prompt-input");
       input.value = ${JSON.stringify(EXPECT)};
       input.dispatchEvent(new Event("input", { bubbles: true }));
       await new Promise((resolve) => setTimeout(resolve, p.settings.delayMs + 300));
       const selected = document.querySelector(".suggestion-item.is-selected .suggestion-title");
       return { selected: selected ? selected.textContent.trim() : null };
     })()`,
  );
  record("auto match selected the typed title", autoMatch.selected === EXPECT, autoMatch);
}

// --- A real AbstractInputSuggest: the property-name field opens a PopoverSuggest
// that calls open() on every keystroke. This is the path that produced one
// context per character in 0.1.0, and the only runtime check that can catch it.
// Close the switcher the way a user would; removing the node would leave the
// modal's keymap scope on the stack.
await ev(
  `(() => {
     window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
     return true;
   })()`,
);
await sleep(400);

const popoverReady = await ev(
  `(async () => {
     const file = app.vault.getAbstractFileByPath("Daily Note.md");
     if (!file) return { error: "note missing" };
     // A property written by an earlier run would make this query match nothing.
     await app.vault.modify(file, "");
     const leaf = app.workspace.getLeaf(false);
     await leaf.openFile(file);
     await new Promise((resolve) => setTimeout(resolve, 600));
     await leaf.setViewState({ type: "markdown", state: { file: file.path, mode: "source" } });
     await new Promise((resolve) => setTimeout(resolve, 500));
     const addButton = document.querySelector(".metadata-add-button .text-icon-button, .metadata-add-button");
     if (!addButton) return { error: "no add-property button" };
     addButton.click();
     await new Promise((resolve) => setTimeout(resolve, 400));
     const input = document.querySelector(".metadata-property-key-input");
     if (!input) return { error: "no property key input" };
     input.focus();
     return { ok: true, inputClass: input.className, focused: document.activeElement === input };
   })()`,
);
record("popover surface available", Boolean(popoverReady.ok), popoverReady);

if (popoverReady.ok) {
  // Three separate insertions that all keep matching the built-in "aliases"
  // property; a sequence with no matches would empty the list and detach the
  // suggestion container mid-check.
  await client.send("Page.bringToFront", {});

  // Synthesized keystrokes through CDP are dropped once another window has had
  // focus, so the value is set and an `input` event dispatched instead. That is
  // the same event the field fires per character, which is what drives
  // `AbstractInputSuggest.onInputChange -> showSuggestions -> open()`.
  const snapshot = `(() => {
         const p = app.plugins.plugins["snapto"];
         const pick = (p) => {
           const all = p.contexts.all();
           for (let i = all.length - 1; i >= 0; i -= 1) {
             const c = all[i];
             if (!c.isAlive()) continue;
             if (p.settings.scenes[c.scene]?.enabled !== true) continue;
             if (c.getCandidates().length === 0) continue;
             return c;
           }
           return null;
         };
         const context = pick(p);
         // Older builds have no counter; report null so the assertion can say
         // it cannot be evaluated instead of crashing the whole run.
         const binds = p.binder && typeof p.binder.count === "function" ? p.binder.count() : null;
         return { binds, id: context ? context.id : null };
       })()`;

  const bindBefore = await ev(snapshot);
  const typed = [];
  let firstId = null;
  for (const text of ["a", "l", "i"]) {
    const step = await ev(
      `(() => {
         const input = document.querySelector(".metadata-property-key-input");
         if (!input) return { ok: false, reason: "input gone" };
         input.focus();
         input.value += ${JSON.stringify(text)};
         input.dispatchEvent(new InputEvent("input", { bubbles: true }));
         return { ok: true, value: input.value };
       })()`,
    );
    await sleep(350);
    const state = await ev(snapshot);
    if (firstId === null) firstId = state.id;
    typed.push({
      text,
      ...step,
      container: await ev(`!!document.querySelector(".suggestion-container")`),
      binds: state.binds,
      id: state.id,
    });
  }
  const bindAfter = await ev(snapshot);

  // "One context" alone cannot prove the dedupe path ran: pruning also keeps
  // the count at one. The bind counter proves each keystroke really reopened.
  record(
    "three keystrokes caused three opens",
    typeof bindBefore.binds === "number" &&
      typeof bindAfter.binds === "number" &&
      bindAfter.binds - bindBefore.binds === 3,
    { before: bindBefore.binds, after: bindAfter.binds },
  );
  record(
    "one context served all three keystrokes",
    firstId !== null && bindAfter.id === firstId,
    { firstId, lastId: bindAfter.id },
  );

  const popover = await ev(
    `(() => {
       const p = app.plugins.plugins["snapto"];
       const pick = (p) => {
       const all = p.contexts.all();
       for (let i = all.length - 1; i >= 0; i -= 1) {
         const c = all[i];
         if (!c.isAlive()) continue;
         if (p.settings.scenes[c.scene]?.enabled !== true) continue;
         if (c.getCandidates().length === 0) continue;
         return c;
       }
       return null;
     };
       const context = pick(p);
       const container = document.querySelector(".suggestion-container");
       return {
         hasContainer: !!container,
         scene: context ? context.scene : null,
         contexts: p.contexts.size(),
         shortcuts: p.shortcuts.count(),
         watchers: p.autoMatch.count(),
         badges: document.querySelectorAll(".snapto-index").length,
         candidates: context ? context.getCandidates().map((c) => c.text).slice(0, 4) : [],
       };
     })()`,
  );

  record("popover scene detected", popover.scene === "popover-suggest", {
    ...popover,
    typed,
  });
  record(
    "one context after three keystrokes",
    popover.contexts === 1 && popover.shortcuts === 1 && popover.watchers === 1,
    popover,
  );
  record("popover badges rendered", popover.badges > 0, `${popover.badges} badges`);

  // Property names are a fixed list, so typing a full one cannot invent a
  // property; the note is reset above so a previous run's value cannot match.
  const autoPick = await ev(
    `(async () => {
       const p = app.plugins.plugins["snapto"];
       const input = document.querySelector(".metadata-property-key-input");
       if (!input) return { selected: null, reason: "input gone" };
       input.value = "aliases";
       input.dispatchEvent(new InputEvent("input", { bubbles: true }));
       await new Promise((resolve) => setTimeout(resolve, p.settings.delayMs + 400));
       const selected = document.querySelector(".suggestion-item.is-selected .suggestion-title");
       return { selected: selected ? selected.textContent.trim() : null };
     })()`,
  );
  record("auto match selected the typed property", autoPick.selected === "aliases", autoPick);

  // Ctrl+2 must pick the second suggestion, creating that property row.
  if (popover.candidates.length >= 2) {
    const picked = await ev(
      `(async () => {
         const p = app.plugins.plugins["snapto"];
         const pick = (p) => {
       const all = p.contexts.all();
       for (let i = all.length - 1; i >= 0; i -= 1) {
         const c = all[i];
         if (!c.isAlive()) continue;
         if (p.settings.scenes[c.scene]?.enabled !== true) continue;
         if (c.getCandidates().length === 0) continue;
         return c;
       }
       return null;
     };
         const expected = pick(p)?.getCandidates()[1]?.text ?? null;
         const evt = new KeyboardEvent("keydown", {
           key: "2", code: "Digit2", ctrlKey: true, bubbles: true, cancelable: true,
         });
         window.dispatchEvent(evt);
         await new Promise((resolve) => setTimeout(resolve, 500));
         const rows = Array.from(document.querySelectorAll(".metadata-property")).map((row) =>
           (row.querySelector(".metadata-property-key-input")?.value ?? "").trim(),
         );
         return { expected, rows, prevented: evt.defaultPrevented };
       })()`,
    );
    record(
      "Ctrl+2 picked the second suggestion",
      picked.rows.includes(picked.expected),
      picked,
    );
  }

  await ev(`(() => {
    const input = document.querySelector(".metadata-property-key-input");
    if (input) input.blur();
    return true;
  })()`);
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
