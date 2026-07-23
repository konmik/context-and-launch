import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@solidjs/testing-library";
import HerdrStatusIcon from "./HerdrStatusIcon";
import type { HerdrAgentStatus } from "~/core/herdr/herdr-client.js";

function renderIcon(status: HerdrAgentStatus) {
  return render(() => <HerdrStatusIcon status={status} />);
}

function iconRoot(container: HTMLElement) {
  return container.querySelector('[data-testid="herdr-status-icon"]') as HTMLElement;
}

describe("HerdrStatusIcon", () => {
  afterEach(() => cleanup());

  it("renders the working state as herdr's braille spinner in the herdr yellow", () => {
    const { container } = renderIcon("working");
    const icon = iconRoot(container);
    expect(icon.getAttribute("data-herdr-status")).toBe("working");
    expect(icon.getAttribute("title")).toBe("working");
    const spinner = icon.querySelector('[data-testid="herdr-classic-spinner"]') as HTMLElement;
    expect(spinner).toBeTruthy();
    expect(spinner.style.color).toBe("rgb(249, 226, 175)");
    expect(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]).toContain(spinner.textContent);
  });

  it("renders the blocked glyph as herdr's filled ring in the herdr red", () => {
    const { container } = renderIcon("blocked");
    const icon = iconRoot(container);
    expect(icon.getAttribute("data-herdr-status")).toBe("blocked");
    const glyph = icon.firstElementChild as HTMLElement;
    expect(glyph.textContent).toBe("◉");
    expect(glyph.style.color).toBe("rgb(243, 139, 168)");
  });

  it("renders the idle glyph as herdr's check in the herdr green", () => {
    const { container } = renderIcon("idle");
    const icon = iconRoot(container);
    expect(icon.getAttribute("data-herdr-status")).toBe("idle");
    const glyph = icon.firstElementChild as HTMLElement;
    expect(glyph.textContent).toBe("✓");
    expect(glyph.style.color).toBe("rgb(166, 227, 161)");
  });

  it("renders the done glyph as herdr's filled dot in the herdr teal", () => {
    const { container } = renderIcon("done");
    const icon = iconRoot(container);
    expect(icon.getAttribute("data-herdr-status")).toBe("done");
    const glyph = icon.firstElementChild as HTMLElement;
    expect(glyph.textContent).toBe("●");
    expect(glyph.style.color).toBe("rgb(148, 226, 213)");
  });

  it("renders the unknown glyph as herdr's hollow ring in the herdr overlay gray", () => {
    const { container } = renderIcon("unknown");
    const icon = iconRoot(container);
    expect(icon.getAttribute("data-herdr-status")).toBe("unknown");
    const glyph = icon.firstElementChild as HTMLElement;
    expect(glyph.textContent).toBe("○");
    expect(glyph.style.color).toBe("rgb(108, 112, 134)");
  });
});
