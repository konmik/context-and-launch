import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@solidjs/testing-library";
import HerdrStatusIcon from "./HerdrStatusIcon";
import type { HerdrAgentStatus } from "~/core/herdr/herdr-client.js";

function renderIcon(status: HerdrAgentStatus) {
  return render(() => <HerdrStatusIcon status={status} />);
}

describe("HerdrStatusIcon", () => {
  afterEach(() => cleanup());

  it("renders the working icon with a pulsing primary activity line", () => {
    const { container } = renderIcon("working");
    const icon = container.querySelector('[data-testid="herdr-status-icon"]') as HTMLElement;
    expect(icon).toBeTruthy();
    expect(icon.getAttribute("data-herdr-status")).toBe("working");
    expect(icon.getAttribute("title")).toBe("working");
    const svg = icon.querySelector("svg")!;
    expect(svg.getAttribute("class")).toContain("animate-pulse");
    expect(svg.getAttribute("class")).toContain("text-primary");
  });

  it("renders the blocked icon in the warning color", () => {
    const { container } = renderIcon("blocked");
    const icon = container.querySelector('[data-testid="herdr-status-icon"]') as HTMLElement;
    expect(icon.getAttribute("data-herdr-status")).toBe("blocked");
    expect(icon.getAttribute("title")).toBe("blocked");
    expect(icon.querySelector("svg")!.getAttribute("class")).toContain("text-warning");
  });

  it("renders the idle icon in muted gray", () => {
    const { container } = renderIcon("idle");
    const icon = container.querySelector('[data-testid="herdr-status-icon"]') as HTMLElement;
    expect(icon.getAttribute("data-herdr-status")).toBe("idle");
    expect(icon.getAttribute("title")).toBe("idle");
    expect(icon.querySelector("svg")!.getAttribute("class")).toContain("text-muted-foreground");
  });

  it("renders the done circle-dot icon in muted gray, never a completion check", () => {
    const { container } = renderIcon("done");
    const icon = container.querySelector('[data-testid="herdr-status-icon"]') as HTMLElement;
    expect(icon.getAttribute("data-herdr-status")).toBe("done");
    expect(icon.getAttribute("title")).toBe("done");
    const svg = icon.querySelector("svg")!;
    expect(svg.getAttribute("class")).toContain("text-muted-foreground");
    expect(svg.getAttribute("class")).not.toContain("text-green-600");
    expect(svg.querySelector('circle[r="1"]')).toBeTruthy();
    expect(svg.querySelector("line")).toBeNull();
  });

  it("renders the unknown icon in muted gray", () => {
    const { container } = renderIcon("unknown");
    const icon = container.querySelector('[data-testid="herdr-status-icon"]') as HTMLElement;
    expect(icon.getAttribute("data-herdr-status")).toBe("unknown");
    expect(icon.getAttribute("title")).toBe("unknown");
    expect(icon.querySelector("svg")!.getAttribute("class")).toContain("text-muted-foreground");
  });
});
