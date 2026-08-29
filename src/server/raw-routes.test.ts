import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = {
  getFileContent: vi.fn(),
  getReferencedFileContent: vi.fn(),
  getWorktreeDir: vi.fn(() => "C:/worktree"),
};

import { createRawRouteHandler } from "./raw-route-handler.js";

const handleRawRoute = createRawRouteHandler({
  getWorktreeDir: mocks.getWorktreeDir,
  createTicketStore: () => ({
    getFileContent: mocks.getFileContent,
    getReferencedFileContent: mocks.getReferencedFileContent,
  }),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getWorktreeDir.mockReturnValue("C:/worktree");
  mocks.getFileContent.mockReturnValue(Buffer.from("file body"));
  mocks.getReferencedFileContent.mockReturnValue(Buffer.from("reference body"));
});

describe("raw content routes", () => {
  it("decodes route parameters and returns file content", async () => {
    const response = await handleRawRoute(new Request(
      "http://app/api/projects/my%20project/board/tickets/ST-1-title/files/notes%20one.md",
    ));
    expect(await response?.text()).toBe("file body");
    expect(response?.headers.get("content-type")).toContain("text/plain");
    expect(mocks.getWorktreeDir).toHaveBeenCalledWith("my project");
    expect(mocks.getFileContent).toHaveBeenCalledWith("ST-1-title", "notes one.md");
  });

  it("returns reference content and omits the body for HEAD", async () => {
    const response = await handleRawRoute(new Request(
      "http://app/api/projects/example/board/tickets/ST-1/references/content?path=docs%2Fguide.md",
      { method: "HEAD" },
    ));
    expect(await response?.text()).toBe("");
    expect(mocks.getReferencedFileContent).toHaveBeenCalledWith("ST-1", "docs/guide.md");
  });

  it("validates the reference path and delegates unsupported requests", async () => {
    const missing = await handleRawRoute(new Request(
      "http://app/api/projects/example/board/tickets/ST-1/references/content",
    ));
    expect(missing?.status).toBe(400);
    expect(await handleRawRoute(new Request("http://app/other"))).toBeUndefined();
    expect(await handleRawRoute(new Request(
      "http://app/api/projects/example/board/tickets/ST-1/references/content",
      { method: "POST" },
    ))).toBeUndefined();
  });

  it("preserves endpoint error responses", async () => {
    mocks.getFileContent.mockImplementation(() => { throw new Error("read failed"); });
    const response = await handleRawRoute(new Request(
      "http://app/api/projects/example/board/tickets/ST-1/files/a.txt",
    ));
    expect(response?.status).toBe(500);
    await expect(response?.json()).resolves.toEqual({ error: "read failed" });
  });
});
