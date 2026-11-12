import type { Candidate, SceneId, SearchContext } from "../types";
import { collectRows, readArray, readInputValue, readProp, readRowText, readString } from "../utils/dom";

/**
 * Shape of Obsidian's internal suggestion list (`Suggestions`), shared by
 * `SuggestModal` and `PopoverSuggest`. Only the members we read are declared.
 *
 * These names are not part of the public API. They are pinned here in one place
 * so that a future shape change breaks a single file instead of the whole plugin.
 */
export interface SuggestionListLike {
  values?: unknown[] | null;
  suggestions?: HTMLElement[];
  selectedItem?: number;
  containerEl?: HTMLElement;
  chooser?: unknown;
  setSelectedItem?: (index: number, evt?: unknown) => void;
  useSelectedItem?: (evt?: unknown) => boolean;
}

/** Group headers are rendered as rows but cannot be chosen. */
function isGroupValue(value: unknown): boolean {
  return readString(value, "type") === "group";
}

/** Best-effort title for a raw suggestion value, used when the row is missing. */
function textFromValue(value: unknown): string {
  // Values are usually wrappers: `{ match, item }` or `{ type, file, ... }`.
  const source = readProp(value, "item") ?? readProp(value, "file") ?? value;
  if (typeof source === "string") return source;
  return (
    readString(source, "basename") ??
    readString(source, "name") ??
    readString(source, "title") ??
    readString(source, "path") ??
    ""
  );
}

/**
 * Live view over one suggestion list.
 *
 * Reading goes through the DOM because that is what the user sees; acting goes
 * through the list object because that is what the host actually listens to.
 * Both paths are verified in `docs/API_COMPATIBILITY.md`.
 */
export class SuggestionContext implements SearchContext {
  readonly id: string;
  /** The instance this context was built from. Used to avoid duplicates. */
  readonly host: unknown;
  readonly containerEl: HTMLElement;
  readonly inputEl: HTMLElement | null;
  readonly scope: unknown;

  private readonly list: SuggestionListLike;
  private readonly doc: Document;
  private initialScene: SceneId;
  private sceneResolver: (() => SceneId) | null = null;
  private lastNavigationAt = 0;

  constructor(params: {
    id: string;
    host: unknown;
    scene: SceneId;
    list: SuggestionListLike;
    containerEl: HTMLElement;
    inputEl: HTMLElement | null;
    scope: unknown;
    doc: Document;
  }) {
    this.id = params.id;
    this.host = params.host;
    this.initialScene = params.scene;
    this.list = params.list;
    this.containerEl = params.containerEl;
    this.inputEl = params.inputEl;
    this.scope = params.scope;
    this.doc = params.doc;
  }

  /**
   * Scene is resolved lazily: a modal opened before any result exists cannot be
   * classified yet, so the detector is asked again on each read.
   */
  get scene(): SceneId {
    return this.sceneResolver ? this.sceneResolver() : this.initialScene;
  }

  setSceneResolver(resolver: () => SceneId): void {
    this.sceneResolver = resolver;
  }

  getQuery(): string {
    return readInputValue(this.inputEl).trim();
  }

  getValues(): unknown[] {
    return readArray(this.list, "values") ?? [];
  }

  /** Rows currently rendered, in the same order as the selectable values. */
  getRows(): HTMLElement[] {
    return collectRows(this.containerEl);
  }

  /**
   * Pair each selectable value with the row that renders it.
   *
   * The host renders one row per value, group headers included. When a third
   * party inserts extra decoration the counts drift, so as a fallback non-group
   * rows are paired with non-group values in order.
   *
   * Every caller that needs "row for value index" goes through here; keeping one
   * implementation is what stops read and click paths from disagreeing.
   */
  private pairedRows(): Array<{ index: number; row: HTMLElement | undefined }> {
    const values = this.getValues();
    const rows = this.getRows();
    const oneRowPerValue = rows.length === values.length;
    const plainRows = rows.filter((row) => !row.hasClass("mod-group"));

    const pairs: Array<{ index: number; row: HTMLElement | undefined }> = [];
    let cursor = 0;
    for (let index = 0; index < values.length; index += 1) {
      if (isGroupValue(values[index])) continue;
      const row = oneRowPerValue ? rows[index] : plainRows[cursor];
      cursor += 1;
      pairs.push({ index, row });
    }
    return pairs;
  }

  getCandidates(): Candidate[] {
    const values = this.getValues();
    const candidates: Candidate[] = [];

    for (const { index, row } of this.pairedRows()) {
      const raw = values[index];
      const text = (row ? readRowText(row) : "") || textFromValue(raw);
      if (text.length === 0) continue;
      candidates.push({ index, text, raw });
    }

    return candidates;
  }

  getSelectedIndex(): number {
    const value = this.list.selectedItem;
    return typeof value === "number" ? value : -1;
  }

  setSelectedIndex(index: number): void {
    const setter = this.list.setSelectedItem;
    if (typeof setter === "function") setter.call(this.list, index, this.makeKeyEvent());
  }

  commit(index: number): void {
    this.setSelectedIndex(index);
    const use = this.list.useSelectedItem;
    if (typeof use === "function") {
      use.call(this.list, this.makeKeyEvent());
      return;
    }
    this.clickRow(index);
  }

  /** Fallback used when the host list has no `useSelectedItem` (third-party UI). */
  private clickRow(index: number): boolean {
    const target = this.pairedRows().find((pair) => pair.index === index)?.row;
    if (!target) return false;
    const Ctor = this.doc.defaultView?.MouseEvent;
    if (!Ctor) return false;
    const event = new Ctor("click", { bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return true;
  }

  /** Synthetic event so host handlers that inspect modifiers keep working. */
  private makeKeyEvent(): Event {
    const Ctor = this.doc.defaultView?.KeyboardEvent;
    if (!Ctor) return new Event("keydown");
    return new Ctor("keydown", { key: "Enter", bubbles: true });
  }

  isAlive(): boolean {
    return this.containerEl.isConnected && this.getValues().length > 0;
  }

  noteManualNavigation(): void {
    this.lastNavigationAt = Date.now();
  }

  wasManuallyMoved(withinMs: number): boolean {
    return Date.now() - this.lastNavigationAt < withinMs;
  }
}
