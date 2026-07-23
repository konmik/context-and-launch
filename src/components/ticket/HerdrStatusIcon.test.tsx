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

  it("renders the working state as a classic braille spinner in the herdr yellow", () => {
    const { container } = renderIcon("working");
    const icon = iconRoot(container);
    expect(icon.getAttribute("data-herdr-status")).toBe("working");
    expect(icon.getAttribute("title")).toBe("working");
    const spinner = icon.querySelector('[data-testid="herdr-classic-spinner"]') as HTMLElement;
    expect(spinner).toBeTruthy();
    expect(spinner.style.color).toBe("rgb(249, 226, 175)");
    expect(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]).toContain(spinner.textContent);
  });

  it("renders the blocked icon in the herdr red", () => {
    const { container } = renderIcon("blocked");
    const icon = iconRoot(container);
    expect(icon.getAttribute("data-herdr-status")).toBe("blocked");
    expect(icon.querySelector("svg")!.style.color).toBe("rgb(243, 139, 168)");
  });

  it("renders the idle icon in the herdr green", () => {
    const { container } = renderIcon("idle");
    const icon = iconRoot(container);
    expect(icon.getAttribute("data-herdr-status")).toBe("idle");
    expect(icon.querySelector("svg")!.style.color).toBe("rgb(166, 227, 161)");
  });

  it("renders the done circle-dot icon in the herdr teal, never a completion check", () => {
    const { container } = renderIcon("done");
    const icon = iconRoot(container);
    expect(icon.getAttribute("data-herdr-status")).toBe("done");
    const svg = icon.querySelector("svg")!;
    expect(svg.style.color).toBe("rgb(148, 226, 213)");
    expect(svg.querySelector('circle[r="1"]')).toBeTruthy();
    expect(svg.querySelector("line")).toBeNull();
  });

  it("renders the unknown icon in the herdr overlay gray", () => {
    const { container } = renderIcon("unknown");
    const icon = iconRoot(container);
    expect(icon.getAttribute("data-herdr-status")).toBe("unknown");
    expect(icon.querySelector("svg")!.style.color).toBe("rgb(108, 112, 134)");
  });
});
