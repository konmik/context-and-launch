import { describe, it, expect, vi, afterEach } from "vitest";
import { createRoot, createSignal } from "solid-js";

vi.mock("../board/board-api.js", () => ({
  listBoards: vi.fn(),
}));

import { listBoards } from "../board/board-api.js";

function flushMicrotasks(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

describe("BoardSelector", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("sets error and keeps boardId empty when listBoards throws", async () => {
    vi.mocked(listBoards).mockRejectedValue(new Error("boards.json not found (500)"));

    const result = await new Promise<{ error: string; boardId: string }>((resolve) => {
      createRoot(async (dispose) => {
        const [boardId, setBoardId] = createSignal("");
        let error = "";
        const { default: BoardSelector } = await import("./BoardSelector.jsx");
        BoardSelector({ boardId, setBoardId, onError: (msg: string) => { error = msg; } });
        await flushMicrotasks();
        resolve({ error, boardId: boardId() });
        dispose();
      });
    });

    expect(result.boardId).toBe("");
    expect(result.error).toContain("500");
  });

  it("populates boardId on successful fetch", async () => {
    const boardData = [
      { id: "standard", name: "Standard", columns: [] },
      { id: "simple", name: "Simple", columns: [] },
    ];
    vi.mocked(listBoards).mockResolvedValue(boardData);

    const result = await new Promise<{ boardId: string }>((resolve) => {
      createRoot(async (dispose) => {
        const [boardId, setBoardId] = createSignal("");
        const { default: BoardSelector } = await import("./BoardSelector.jsx");
        BoardSelector({ boardId, setBoardId });
        await flushMicrotasks();
        resolve({ boardId: boardId() });
        dispose();
      });
    });

    expect(result.boardId).toBe("standard");
  });
});
