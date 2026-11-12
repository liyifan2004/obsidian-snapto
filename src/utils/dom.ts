/** Read a property from an unknown object without asserting a full shape. */
export function readProp(source: unknown, key: string): unknown {
  if (source === null || typeof source !== "object") return undefined;
  return (source as Record<string, unknown>)[key];
}

/** Read a string property, falling back when the value is missing or empty. */
export function readString(source: unknown, key: string): string | null {
  const value = readProp(source, key);
  return typeof value === "string" ? value : null;
}

/** Read an array property, returning null instead of a half-typed array. */
export function readArray(source: unknown, key: string): unknown[] | null {
  const value = readProp(source, key);
  return Array.isArray(value) ? value : null;
}

/**
 * Element check that survives popout windows.
 *
 * `instanceof HTMLElement` compares against the constructor of the *current*
 * realm, so every node from a popout window fails it. Duck typing on `nodeType`
 * and `querySelectorAll` has no realm to get wrong.
 */
export function isElementLike(value: unknown): value is HTMLElement {
  if (value === null || typeof value !== "object") return false;
  const node = value as { nodeType?: unknown; querySelectorAll?: unknown };
  return node.nodeType === 1 && typeof node.querySelectorAll === "function";
}

/**
 * Text of one suggestion row, matching what the user sees as its title.
 *
 * Obsidian renders `suggestion-content` with a `suggestion-title` inside and
 * optional `suggestion-note` (path, alias, hotkey) next to it. Reading the note
 * would make "foo" fail against "foo.md — 3 matches", so the title wins.
 */
export function readRowText(row: HTMLElement): string {
  const title = row.querySelector<HTMLElement>(".suggestion-title");
  if (title?.textContent) return title.textContent.trim();

  const content = row.querySelector<HTMLElement>(".suggestion-content");
  if (content) {
    const first = content.firstElementChild;
    const text = (first ?? content).textContent ?? "";
    return text.trim();
  }

  return (row.textContent ?? "").trim();
}

/** Direct suggestion rows of a list container, skipping nested decorations. */
export function collectRows(containerEl: HTMLElement): HTMLElement[] {
  return Array.from(containerEl.querySelectorAll<HTMLElement>(":scope > .suggestion-item"));
}

/** Text input value, tolerating contenteditable hosts. */
export function readInputValue(el: HTMLElement | null): string {
  if (!el) return "";
  if (el.instanceOf(HTMLInputElement) || el.instanceOf(HTMLTextAreaElement)) return el.value;
  return el.textContent ?? "";
}
