import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "~/test-render.js";
import HerdrStatusIcon from "./HerdrStatusIcon";
import type { HerdrAgentStatus } from "~/core/herdr/herdr-client.js";

function renderIcon(status: HerdrAgentStatus) {
  return render(() => <HerdrStatusIcon status={status} />);
}

function iconRoot(container: HTMLElement) {
  const icon = container.querySelector<HTMLElement>('[data-testid="herdr-status-icon"]');
  if (!icon) throw new Error("Expected Herdr status icon to be rendered");
  return icon;
}

function expectGlyph(
  container: HTMLElement, status: HerdrAgentStatus, glyph: string, color: string,
) {
  const icon = iconRoot(container);
  expect(icon.getAttribute("data-herdr-status")).toBe(status);
  expect(icon.getAttribute("title")).toBe(status);
  const renderedGlyph = icon.firstElementChild;
  if (!(renderedGlyph instanceof HTMLElement)) {
    throw new Error("Expected Herdr status icon to contain an element glyph");
  }
  expect(renderedGlyph.textContent).toBe(glyph);
  expect(renderedGlyph.style.color).toBe(color);
}

describe("HerdrStatusIcon", () => {
  afterEach(() => cleanup());

  it("renders the working state as herdr's filled dot in the herdr yellow", () => {
    const { container } = renderIcon("working");
    expectGlyph(container, "working", "●", "rgb(249, 226, 175)");
  });

  it("renders the blocked state as herdr's filled dot in the herdr red", () => {
    const { container } = renderIcon("blocked");
    expectGlyph(container, "blocked", "●", "rgb(243, 139, 168)");
  });

  it("renders the idle state as herdr's hollow dot in the herdr green", () => {
    const { container } = renderIcon("idle");
    expectGlyph(container, "idle", "○", "rgb(166, 227, 161)");
  });

  it("renders the done state as herdr's filled dot in the herdr teal", () => {
    const { container } = renderIcon("done");
    expectGlyph(container, "done", "●", "rgb(148, 226, 213)");
  });

  it("renders the unknown state as herdr's middle dot in the herdr overlay gray", () => {
    const { container } = renderIcon("unknown");
    expectGlyph(container, "unknown", "·", "rgb(108, 112, 134)");
  });
});
