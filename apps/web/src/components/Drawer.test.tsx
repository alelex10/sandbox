import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Drawer } from "./Drawer.js";

// jsdom implements HTMLDialogElement, but not the full native modal/top-layer
// behavior — spy on the two lifecycle methods directly to prove WHICH one
// this component calls, since that's the entire point of the `modal` prop.
describe("Drawer modal prop", () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    });
    HTMLDialogElement.prototype.show = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    });
  });

  it("calls showModal() when opened WITHOUT a modal prop (existing call sites, byte-identical default)", () => {
    render(
      <Drawer open={true} onClose={() => {}} title="Test">
        <div>content</div>
      </Drawer>,
    );

    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
    expect(HTMLDialogElement.prototype.show).not.toHaveBeenCalled();
  });

  it("calls showModal() when opened with modal={true} explicitly", () => {
    render(
      <Drawer open={true} onClose={() => {}} title="Test" modal={true}>
        <div>content</div>
      </Drawer>,
    );

    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
  });

  it("calls show() instead of showModal() when opened with modal={false}", () => {
    render(
      <Drawer open={true} onClose={() => {}} title="Test" modal={false}>
        <div>content</div>
      </Drawer>,
    );

    expect(HTMLDialogElement.prototype.show).toHaveBeenCalledTimes(1);
    expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled();
  });

  it("does not render the full-viewport backdrop overlay class when modal={false}", () => {
    render(
      <Drawer open={true} onClose={() => {}} title="Test" modal={false}>
        <div>content</div>
      </Drawer>,
    );

    const dialog = screen.getByRole("dialog", { hidden: true });
    expect(dialog.className).not.toContain("backdrop:");
  });

  it("still renders the full-viewport backdrop overlay class in the default (modal) case", () => {
    render(
      <Drawer open={true} onClose={() => {}} title="Test">
        <div>content</div>
      </Drawer>,
    );

    const dialog = screen.getByRole("dialog", { hidden: true });
    expect(dialog.className).toContain("backdrop:");
  });
});
