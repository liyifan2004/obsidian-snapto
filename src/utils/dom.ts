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

export function isElement(value: unknown): value is HTMLElement {
  return value instanceof HTMLElement;
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

/** Whether the event target accepts typed text, so native keys must not be stolen. */
export function isTextEntryTarget(target: unknown): boolean {
  if (!isElement(target)) return false;
  if (target.instanceOf(HTMLInputElement)) return true;
  if (target.instanceOf(HTMLTextAreaElement)) return true;
  return target.isContentEditable;
}
