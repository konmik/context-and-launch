import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "~/test-render.js";

const mockGetAppLogs = vi.fn();

import LogViewerDialog from "./LogViewerDialog";

const deps = {
  getLogs: mockGetAppLogs,
  clearLogs: vi.fn().mockResolvedValue(undefined),
};

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
    render(() => <LogViewerDialog open onOpenChange={() => {}} deps={deps} />);

    await waitFor(() => expect(screen.getByTestId("log-viewer-loading")).toBeTruthy());
    expect(screen.queryByText("No logs yet.")).toBeNull();
  });

  it("shows the empty state once an empty read completes", async () => {
    const logs = deferredLogs();
    render(() => <LogViewerDialog open onOpenChange={() => {}} deps={deps} />);
    await waitFor(() => expect(screen.getByTestId("log-viewer-loading")).toBeTruthy());

    logs.resolve("");

    await waitFor(() => expect(screen.getByText("No logs yet.")).toBeTruthy());
    expect(screen.queryByTestId("log-viewer-loading")).toBeNull();
  });

  it("shows the log text once a non-empty read completes", async () => {
    const logs = deferredLogs();
    render(() => <LogViewerDialog open onOpenChange={() => {}} deps={deps} />);
    await waitFor(() => expect(screen.getByTestId("log-viewer-loading")).toBeTruthy());

    logs.resolve("first line");

    await waitFor(() => expect(
      screen.getByLabelText("Application logs").textContent,
    ).toBe("first line"));
    expect(screen.queryByTestId("log-viewer-loading")).toBeNull();
    expect(screen.queryByText("No logs yet.")).toBeNull();
  });
});
