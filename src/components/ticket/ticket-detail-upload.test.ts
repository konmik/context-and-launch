import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "solid-js";

vi.mock("@solidjs/router", () => ({
  revalidate: vi.fn(),
  action: (fn: Function) => fn,
  query: (fn: Function) => fn,
}));

const mockUploadFile = vi.fn();
vi.mock("./ticket-api.js", () => ({
  uploadFile: (...args: unknown[]) => mockUploadFile(...args),
}));

import { createFileUploadState, type FileUploadDeps } from "./ticket-detail-upload.js";

function makeDeps(overrides?: Partial<FileUploadDeps>): FileUploadDeps {
  return {
    projectSlug: "test-project",
    folderName: () => "t-1-test",
    setError: vi.fn(),
    ticketFileNames: () => [],
    setTicketFileNames: vi.fn(),
    contextNames: [],
    requestFileSwitch: vi.fn(),
    ...overrides,
  };
}

describe("createFileUploadState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not switch to file when upload fails per-file", async () => {
    mockUploadFile.mockResolvedValue({
      ok: true,
      results: [{ name: "report.txt", ok: false, error: "disk full" }],
    });

    const deps = makeDeps();
    await createRoot(async (dispose) => {
      const state = createFileUploadState(deps);
      const file = new File(["content"], "report.txt", { type: "text/plain" });
      await state.handleFileInputChange({
        target: { files: [file], value: "" },
        preventDefault: vi.fn(),
      } as any);
      expect(deps.setError).toHaveBeenCalledWith({ title: "Upload failed", description: "disk full" });
      expect(deps.requestFileSwitch).not.toHaveBeenCalled();
      dispose();
    });
  });

  it("does not switch to .md context view when .md upload fails per-file", async () => {
    mockUploadFile.mockResolvedValue({
      ok: true,
      results: [{ name: "notes.md", ok: false, error: "permission denied" }],
    });

    const deps = makeDeps();
    await createRoot(async (dispose) => {
      const state = createFileUploadState(deps);
      const file = new File(["# Notes"], "notes.md", { type: "text/markdown" });
      await state.handleFileInputChange({
        target: { files: [file], value: "" },
        preventDefault: vi.fn(),
      } as any);
      expect(deps.setError).toHaveBeenCalledWith({ title: "Upload failed", description: "permission denied" });
      expect(deps.requestFileSwitch).not.toHaveBeenCalled();
      dispose();
    });
  });

  it("switches to file when upload succeeds", async () => {
    mockUploadFile.mockResolvedValue({
      ok: true,
      results: [{ name: "report.txt", ok: true }],
    });

    const deps = makeDeps();
    await createRoot(async (dispose) => {
      const state = createFileUploadState(deps);
      const file = new File(["content"], "report.txt", { type: "text/plain" });
      await state.handleFileInputChange({
        target: { files: [file], value: "" },
        preventDefault: vi.fn(),
      } as any);
      expect(deps.requestFileSwitch).toHaveBeenCalledWith({
        type: "file",
        name: "report.txt",
      });
      dispose();
    });
  });
});
