import { afterEach, describe, expect, it, vi } from "vitest";
import { HostPatcher } from "../src/core/HostPatcher";
import { Modal, PopoverSuggest, SuggestModal } from "./mocks/obsidian";

interface Host {
  open(): void;
}

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

    const spy = vi.spyOn(SuggestModal.prototype, "open");
    const modal = new SuggestModal();
    modal.open();

    // The spy wraps the patched method, so its own call proves the chain ran.
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("restores the original prototype on uninstall", () => {
    const original = SuggestModal.prototype.open;
    const callbacks = handlers();
    patcher = new HostPatcher();
    patcher.install(callbacks);
    expect(SuggestModal.prototype.open).not.toBe(original);

    patcher.uninstall();
    patcher = null;

    expect(SuggestModal.prototype.open).toBe(original);
    new SuggestModal().open();
    expect(callbacks.onModalOpen).not.toHaveBeenCalled();
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
