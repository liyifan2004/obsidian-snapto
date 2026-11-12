/**
 * jsdom does not ship Obsidian's DOM helpers. These polyfills reproduce the
 * handful the plugin calls so DOM-level behaviour can be tested without the app.
 *
 * They are intentionally tiny: if a helper is missing here, the plugin probably
 * should not be calling it.
 */
// Side-effect import so the global DOM helpers declared by Obsidian's typings
// are in scope here. Vitest resolves it to the local stub.
import "obsidian";

type Ctor = new (...args: never[]) => unknown;

declare global {
  interface HTMLElement {
    createEl<K extends keyof HTMLElementTagNameMap>(
      tag: K,
      info?: string | DomElementInfo,
      callback?: (el: HTMLElementTagNameMap[K]) => void,
    ): HTMLElementTagNameMap[K];
  }
}

function buildElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  info?: string | DomElementInfo,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (typeof info === "string") {
    el.className = info;
  } else if (info) {
    if (typeof info.cls === "string") el.className = info.cls;
    else if (Array.isArray(info.cls)) el.className = info.cls.join(" ");
    if (typeof info.text === "string") el.textContent = info.text;
    if (info.attr) {
      for (const [key, value] of Object.entries(info.attr)) el.setAttribute(key, String(value));
    }
  }
  return el;
}

// `main.ts` reaches for this at load time; jsdom has no such global.
(globalThis as unknown as Record<string, unknown>).activeDocument = document;

globalThis.createSpan = function createSpan(info?: string | DomElementInfo): HTMLSpanElement {
  return buildElement("span", info);
};

globalThis.createEl = function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  info?: string | DomElementInfo,
  callback?: (el: HTMLElementTagNameMap[K]) => void,
): HTMLElementTagNameMap[K] {
  const el = buildElement(tag, info);
  callback?.(el);
  return el;
};

const proto = HTMLElement.prototype as unknown as Record<string, unknown>;

proto.createEl = function createElOnElement(
  this: HTMLElement,
  tag: keyof HTMLElementTagNameMap,
  info?: string | DomElementInfo,
  callback?: (el: HTMLElement) => void,
): HTMLElement {
  const el = buildElement(tag, info);
  callback?.(el);
  this.appendChild(el);
  return el;
};

proto.addClass = function addClass(this: HTMLElement, ...classes: string[]): void {
  this.classList.add(...classes.filter((name) => name.length > 0));
};

proto.removeClass = function removeClass(this: HTMLElement, ...classes: string[]): void {
  this.classList.remove(...classes.filter((name) => name.length > 0));
};

proto.toggleClass = function toggleClass(this: HTMLElement, name: string, value?: boolean): void {
  if (value === undefined) {
    this.classList.toggle(name);
    return;
  }
  this.classList.toggle(name, value);
};

proto.hasClass = function hasClass(this: HTMLElement, name: string): boolean {
  return this.classList.contains(name);
};

proto.setText = function setText(this: HTMLElement, text: string): void {
  this.textContent = text;
};

proto.empty = function empty(this: HTMLElement): void {
  this.textContent = "";
};

proto.instanceOf = function instanceOf(this: unknown, ctor: Ctor): boolean {
  return this instanceof ctor;
};

export {};
