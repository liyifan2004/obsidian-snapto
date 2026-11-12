import { afterEach, describe, expect, it, vi } from "vitest";
import { HostPatcher } from "../src/core/HostPatcher";
import { Modal, PopoverSuggest, SuggestModal } from "./mocks/obsidian";

function handlers() {
  return { onModalOpen: vi.fn(), onSuggestOpen: vi.fn() };
}

describe("HostPatcher", () => {
  let patcher: HostPatcher | null = null;

  afterEach(() => {
    patcher?.uninstall();
    patcher = null;
  });

  it("notifies on modal open", () => {
    const callbacks = handlers();
    patcher = new HostPatcher();
    patcher.install(callbacks);

    const modal = new SuggestModal();
    modal.open();

    expect(callbacks.onModalOpen).toHaveBeenCalledTimes(1);
    expect(callbacks.onModalOpen).toHaveBeenCalledWith(modal);
  });

  it("notifies on popover open", () => {
    const callbacks = handlers();
    patcher = new HostPatcher();
    patcher.install(callbacks);

    new PopoverSuggest().open();

    expect(callbacks.onSuggestOpen).toHaveBeenCalledTimes(1);
  });

  it("leaves other Modal subclasses alone", () => {
    const callbacks = handlers();
    patcher = new HostPatcher();
    patcher.install(callbacks);

    new Modal().open();

    expect(callbacks.onModalOpen).not.toHaveBeenCalled();
  });

  it("still runs the original method", () => {
    patcher = new HostPatcher();
    patcher.install(handlers());

    const modal = new SuggestModal();
    modal.open();

    // The base class counts the call, so the wrapper reached it.
    expect(modal.openCount).toBe(1);
  });

  it("restores the prototype chain on uninstall", () => {
    const owns = () => Object.prototype.hasOwnProperty.call(SuggestModal.prototype, "open");
    expect(owns()).toBe(false);

    const callbacks = handlers();
    patcher = new HostPatcher();
    patcher.install(callbacks);
    expect(owns()).toBe(true);

    patcher.uninstall();
    patcher = null;

    // Own property removed, so the inherited implementation is used again.
    expect(owns()).toBe(false);
    new SuggestModal().open();
    expect(callbacks.onModalOpen).not.toHaveBeenCalled();
  });

  it("leaves a third-party wrapper installed after us in place", () => {
    const callbacks = handlers();
    patcher = new HostPatcher();
    patcher.install(callbacks);

    // Another plugin wraps the method after we did, calling through to us.
    const ourLayer = Object.getOwnPropertyDescriptor(SuggestModal.prototype, "open")
      ?.value as ((this: unknown) => void) | undefined;
    const outerCalls: string[] = [];
    const outer = function (this: unknown): void {
      outerCalls.push("outer");
      ourLayer?.call(this);
    };
    SuggestModal.prototype.open = outer;

    patcher.uninstall();
    patcher = null;

    // Their layer must survive; ours must go quiet.
    const installed = Object.getOwnPropertyDescriptor(SuggestModal.prototype, "open")?.value as unknown;
    expect(installed).toBe(outer);
    const modal = new SuggestModal();
    modal.open();

    expect(outerCalls).toEqual(["outer"]);
    expect(callbacks.onModalOpen).not.toHaveBeenCalled();
    expect(modal.openCount).toBe(1);
  });

  it("can be installed twice without stacking", () => {
    const callbacks = handlers();
    patcher = new HostPatcher();
    patcher.install(callbacks);
    patcher.install(callbacks);

    new SuggestModal().open();

    expect(callbacks.onModalOpen).toHaveBeenCalledTimes(1);
  });

  it("does not let a failing handler break the host", () => {
    patcher = new HostPatcher();
    patcher.install({
      onModalOpen: () => {
        throw new Error("boom");
      },
      onSuggestOpen: vi.fn(),
    });

    expect(() => new SuggestModal().open()).not.toThrow();
  });
});
