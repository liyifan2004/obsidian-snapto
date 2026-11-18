import type { SceneId } from "../../types";
import { isElementLike, readArray, readProp, readString } from "../../utils/dom";
import { SuggestionContext, type SuggestionListLike } from "../SuggestionContext";

let contextSerial = 0;

function nextId(prefix: string): string {
  contextSerial += 1;
  return `${prefix}-${contextSerial}`;
}

/**
 * Suggestion values are often wrappers rather than the items themselves:
 *
 * - `FuzzySuggestModal` pushes `{ match, item }`
 * - the quick switcher pushes `{ type, file, match, downranked }`
 *
 * Both are unwrapped here so scene detection and text extraction see the file
 * or command behind the row.
 */
export function unwrapSuggestion(value: unknown): unknown {
  return readProp(value, "item") ?? readProp(value, "file") ?? value;
}

/** Obsidian's `Command` objects expose id + name and at least one callback. */
function isCommandLike(value: unknown): boolean {
  if (readString(value, "id") === null || readString(value, "name") === null) return false;
  return (
    typeof readProp(value, "callback") === "function" ||
    typeof readProp(value, "checkCallback") === "function" ||
    typeof readProp(value, "editorCallback") === "function" ||
    typeof readProp(value, "editorCheckCallback") === "function"
  );
}

/** `TFile` / `TFolder` duck type: path + basename + extension-ish shape. */
function isFileLike(value: unknown): boolean {
  if (readString(value, "path") === null) return false;
  return readString(value, "basename") !== null || readString(value, "name") !== null;
}

/**
 * Decide which product-level scene a modal belongs to.
 *
 * Heuristics only, strongest signal first. A wrong guess costs the user a
 * scene-specific toggle, never a broken shortcut: every modal keeps working
 * through the generic `plugin-modal` fallback.
 *
 * Returns `null` when the list carries no sample value to classify. That is
 * the normal state right after the user typed something that matches nothing:
 * the host renders a "press Enter to create" placeholder whose value is
 * `null`. Guessing a scene from that placeholder would misfile the surface —
 * and a misfiled surface is governed by the wrong scene's toggle, so a
 * disabled scene could switch itself back on.
 */
export function detectModalScene(values: readonly unknown[]): SceneId | null {
  const sample = values.find(
    (value) => value !== null && value !== undefined && readString(value, "type") !== "group",
  );
  if (sample === undefined) return null;
  const item = unwrapSuggestion(sample);
  if (isCommandLike(item)) return "command-palette";
  if (isFileLike(item)) return "quick-switcher";
  return "plugin-modal";
}

function isEditorSuggest(host: unknown): boolean {
  return readProp(host, "context") !== undefined || readProp(host, "editor") !== undefined;
}

/**
 * Build a context for a `SuggestModal` instance.
 *
 * Reads three internal members: `chooser`, `resultContainerEl`, `scope`.
 * Everything degrades to null rather than throwing, so an unexpected shape just
 * disables this one modal.
 */
export function attachSuggestModal(modal: unknown): SuggestionContext | null {
  const list = readProp(modal, "chooser") as SuggestionListLike | undefined;
  const container = readProp(modal, "resultContainerEl");
  if (!list || !isElementLike(container)) return null;

  const values = readArray(list, "values") ?? [];
  // A modal can open before it has any result. The generic scene is the
  // fallback until the detector can say better.
  const scene = detectModalScene(values) ?? "plugin-modal";

  const context = new SuggestionContext({
    id: nextId(scene),
    host: modal,
    scene,
    list,
    containerEl: container,
    inputEl: asElement(readProp(modal, "inputEl")),
    scope: readProp(modal, "scope"),
    doc: container.ownerDocument,
  });
  context.setSceneResolver(() => detectModalScene(context.getValues()));
  return context;
}

/**
 * Build a context for a `PopoverSuggest` instance (EditorSuggest, tag suggest,
 * link suggest, abstract input suggest).
 *
 * `suggestions.containerEl` is the inner scroll container holding the rows.
 */
export function attachPopoverSuggest(host: unknown): SuggestionContext | null {
  const list = readProp(host, "suggestions") as SuggestionListLike | undefined;
  if (!list) return null;

  const container = asElement(readProp(list, "containerEl")) ?? asElement(readProp(host, "suggestEl"));
  if (!container) return null;

  const scene: SceneId = isEditorSuggest(host) ? "editor-suggest" : "popover-suggest";

  return new SuggestionContext({
    id: nextId(scene),
    host,
    scene,
    list,
    containerEl: container,
    inputEl: asElement(readProp(host, "textInputEl")),
    scope: readProp(host, "scope"),
    doc: container.ownerDocument,
  });
}

function asElement(value: unknown): HTMLElement | null {
  return isElementLike(value) ? value : null;
}
