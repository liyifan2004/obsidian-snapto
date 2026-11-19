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

  it("reports whether its wrapper is the live one", () => {
    const patcher = new HostPatcher();
    expect(patcher.isActive).toBe(false);

    patcher.install(handlers());
    expect(patcher.isActive).toBe(true);

    patcher.uninstall();
    expect(patcher.isActive).toBe(false);
  });

  it("counts the surfaces its wrapper saw", () => {
    const patcher = new HostPatcher();
    patcher.install(handlers());
    expect(patcher.callCount).toBe(0);

    new SuggestModal().open();
    expect(patcher.callCount).toBe(1);

    new SuggestModal().open();
    expect(patcher.callCount).toBe(2);
  });

  it("keeps counting the surfaces it saw when another plugin wraps it", () => {
    const patcher = new HostPatcher();
    patcher.install(handlers());

    // Another plugin puts its own layer on top of ours and calls through.
    const ours = Object.getOwnPropertyDescriptor(SuggestModal.prototype, "open")
      ?.value as ((this: unknown) => void) | undefined;
    SuggestModal.prototype.open = function (this: unknown): void {
      ours?.call(this);
    };

    new SuggestModal().open();

    // Our layer is still in the chain, and it ran.
    expect(patcher.callCount).toBe(1);
    // But the host now calls their layer, not ours.
    expect(patcher.isActive).toBe(false);
  });

  it("reports inactive when another plugin replaces the method entirely", () => {
    const patcher = new HostPatcher();
    patcher.install(handlers());

    // A layer that does not call through: our wrapper is gone from the chain.
    SuggestModal.prototype.open = function (): void {};

    expect(patcher.isActive).toBe(false);
  });

  it("is not active when one of the two patches is replaced", () => {
    const patcher = new HostPatcher();
    patcher.install(handlers());

    // Both wrappers ran, so the history says "we were there".
    new SuggestModal().open();
    new PopoverSuggest().open();
    expect(patcher.callCount).toBe(2);

    // One of them is replaced by something that does not call through. The
    // accumulated count must not paper over that.
    PopoverSuggest.prototype.open = function (): void {};

    expect(patcher.isActive).toBe(false);
    // The count is history; it stays where it was.
    expect(patcher.callCount).toBe(2);
  });
});
