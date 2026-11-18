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

/**
 * Whether a value stands for a row the user can actually pick.
 *
 * Obsidian renders a "press Enter to create <query>" placeholder when a
 * suggestion list has no match. It is a real row in the DOM, so the row
 * scanner sees it, but its value is `null`: it is not a result, it is an
 * action. Treating it as a result makes the plugin offer it as a numbered
 * shortcut and, with auto confirm on, open a file the user never asked for.
 *
 * The placeholder is the only row whose value is `null`, so this one check
 * covers every surface that renders one.
 */
function isSelectableValue(value: unknown): boolean {
  return value !== null && value !== undefined;
}

/**
 * Whether a row is the "press Enter to create" placeholder.
 *
 * The row carries the hint in its aux area, next to the text the user typed.
 * Checking the markup as well as the value means the placeholder is still
 * recognised if a host ever gives it a non-null value.
 */
export function isCreatePlaceholderRow(row: HTMLElement): boolean {
  return row.querySelector(".suggestion-action") !== null;
}

/**
 * Modifier flags of a keyboard event, read by shape.
 *
 * `instanceof KeyboardEvent` is false for an event from a popout window: the
 * constructor belongs to the other realm. The plugin already matches elements
 * by shape for the same reason, and the flags have to survive that boundary
 * too — otherwise the modifier is dropped in exactly the window the plugin
 * claims to support.
 */
function modifierFlags(source?: Event): {
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
} {
  const empty = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };
  if (!source || typeof source !== "object") return empty;
  const candidate = source as unknown as {
    type?: unknown;
    ctrlKey?: unknown;
    metaKey?: unknown;
    altKey?: unknown;
    shiftKey?: unknown;
  };
  // A mouse event carries modifier flags too, but it is not a key press.
  if (candidate.type !== "keydown" && candidate.type !== "keyup") return empty;
  return {
    ctrlKey: candidate.ctrlKey === true,
    metaKey: candidate.metaKey === true,
    altKey: candidate.altKey === true,
    shiftKey: candidate.shiftKey === true,
  };
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
  /**
   * Returns the current scene, or `null` when the host cannot be classified.
   *
   * `null` matters: a list that has just gone empty carries no sample value,
   * so the detector cannot tell a quick switcher from a command palette. The
   * resolver must say "I do not know" rather than guess.
   */
  private sceneResolver: (() => SceneId | null) | null = null;
  /** Last scene the detector could actually confirm. */
  private lastConfirmedScene: SceneId | null = null;
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
   *
   * When the detector cannot classify the surface — an empty list carries no
   * sample value — the last confirmed scene is kept. Guessing a fresh scene
   * from an empty list is what made a disabled scene come back to life: the
   * quick switcher went empty, was misread as a generic plugin modal, and
   * that other scene's toggle decided whether the shortcuts ran.
   */
  get scene(): SceneId {
    if (!this.sceneResolver) return this.initialScene;
    const detected = this.sceneResolver();
    if (detected === null) return this.lastConfirmedScene ?? this.initialScene;
    this.lastConfirmedScene = detected;
    return detected;
  }

  setSceneResolver(resolver: () => SceneId | null): void {
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
   * Both fallbacks skip rows that cannot be picked — group headers and the
   * "press Enter to create" placeholder — so a row is only ever paired with a
   * value the user could actually choose.
   *
   * Every caller that needs "row for value index" goes through here; keeping one
   * implementation is what stops read and click paths from disagreeing.
   */
  private pairedRows(): Array<{ index: number; row: HTMLElement | undefined }> {
    const values = this.getValues();
    const rows = this.getRows();
    const oneRowPerValue = rows.length === values.length;
    const plainRows = rows.filter(
      (row) =>
        !row.hasClass("mod-group") &&
        !row.hasClass("suggestion-empty") &&
        !isCreatePlaceholderRow(row),
    );

    const pairs: Array<{ index: number; row: HTMLElement | undefined }> = [];
    let cursor = 0;
    for (let index = 0; index < values.length; index += 1) {
      if (isGroupValue(values[index])) continue;
      if (!isSelectableValue(values[index])) continue;
      const row = oneRowPerValue ? rows[index] : plainRows[cursor];
      // A placeholder row is an action, not a result, whatever its value is.
      if (row && isCreatePlaceholderRow(row)) {
        cursor += 1;
        continue;
      }
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

  setSelectedIndex(index: number, source?: Event): void {
    const setter = this.list.setSelectedItem;
    if (typeof setter === "function") setter.call(this.list, index, this.makeKeyEvent(source));
  }

  /**
   * Choose a row.
   *
   * `source` is the key event that triggered the choice. It matters: Obsidian
   * reads `isModEvent(event)` to decide whether to replace the current leaf or
   * open a new tab, and that only looks at the event's modifier flags. A
   * synthetic event without them silently drops the modifier, so `Ctrl+2`
   * replaced the open note instead of opening the target in a new tab.
   */
  commit(index: number, source?: Event): void {
    this.setSelectedIndex(index, source);
    const use = this.list.useSelectedItem;
    if (typeof use === "function") {
      use.call(this.list, this.makeKeyEvent(source));
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

  /**
   * Synthetic event so host handlers that inspect modifiers keep working.
   *
   * The modifier flags of `source` are carried over. Obsidian decides between
   * "replace the current leaf" and "open a new tab" by asking
   * `isModEvent(event)`, which only looks at those flags — a plain synthetic
   * Enter reads as "no modifier", so `Ctrl+2` would open the note in place
   * instead of in a new tab.
   */
  private makeKeyEvent(source?: Event): Event {
    const Ctor = this.doc.defaultView?.KeyboardEvent;
    if (!Ctor) return new Event("keydown");
    const flags = modifierFlags(source);
    return new Ctor("keydown", {
      key: "Enter",
      bubbles: true,
      ctrlKey: flags.ctrlKey,
      metaKey: flags.metaKey,
      altKey: flags.altKey,
      shiftKey: flags.shiftKey,
    });
  }

  /**
   * Alive means the host still has the container in the document.
   *
   * An empty result set is a normal state — the user typed something that
   * matches nothing — so `values.length` deliberately plays no part here.
   * Treating it as death used to drop the watcher and re-create the context
   * (with a new id) as soon as results came back.
   */
  isAlive(): boolean {
    return this.containerEl.isConnected;
  }

  noteManualNavigation(): void {
    this.lastNavigationAt = Date.now();
  }

  wasManuallyMoved(withinMs: number): boolean {
    return Date.now() - this.lastNavigationAt < withinMs;
  }
}
