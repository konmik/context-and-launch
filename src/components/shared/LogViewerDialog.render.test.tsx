import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@solidjs/testing-library";

const mockGetAppLogs = vi.fn();

vi.mock("./log-api.js", () => ({
  getAppLogs: (...args: unknown[]) => mockGetAppLogs(...args),
  serverClearAppLogs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./LogTextView.js", () => ({
  default: (props: { text: string }) => <div data-testid="log-text">{props.text}</div>,
}));

vi.mock("../ui/floating-panel", () => ({
  FloatingWindow: (props: any) => <div data-testid="floating-panel">{props.children}</div>,
  FloatingWindowHeader: (props: any) => <div>{props.title}{props.actions}</div>,
  FloatingPanelBody: (props: any) => <div>{props.children}</div>,
  FloatingPanelTitle: (props: any) => <div>{props.children}</div>,
}));

import LogViewerDialog from "./LogViewerDialog";

afterEach(() => {
  cleanup();
  mockGetAppLogs.mockReset();
});

function deferredLogs() {
  let resolveLogs!: (text: string) => void;
  mockGetAppLogs.mockReturnValue(new Promise<string>((r) => { resolveLogs = r; }));
  return { resolve: (text: string) => resolveLogs(text) };
}

describe("LogViewerDialog read states", () => {
  it("shows loading and not the empty state while the initial read is pending", async () => {
    deferredLogs();
    render(() => <LogViewerDialog open onOpenChange={() => {}} />);

    await waitFor(() => expect(screen.getByTestId("log-viewer-loading")).toBeTruthy());
    expect(screen.queryByText("No logs yet.")).toBeNull();
  });

  it("shows the empty state once an empty read completes", async () => {
    const logs = deferredLogs();
    render(() => <LogViewerDialog open onOpenChange={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("log-viewer-loading")).toBeTruthy());

    logs.resolve("");

    await waitFor(() => expect(screen.getByText("No logs yet.")).toBeTruthy());
    expect(screen.queryByTestId("log-viewer-loading")).toBeNull();
  });

  it("shows the log text once a non-empty read completes", async () => {
    const logs = deferredLogs();
    render(() => <LogViewerDialog open onOpenChange={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("log-viewer-loading")).toBeTruthy());

    logs.resolve("first line");

    await waitFor(() => expect(screen.getByTestId("log-text").textContent).toBe("first line"));
    expect(screen.queryByTestId("log-viewer-loading")).toBeNull();
    expect(screen.queryByText("No logs yet.")).toBeNull();
  });
});
