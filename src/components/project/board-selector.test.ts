import { describe, it, expect } from "vitest";
import { createRoot, createSignal } from "solid-js";

function flushMicrotasks(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

describe("BoardSelector", () => {
  it("sets error and keeps boardId empty when listBoards throws", async () => {
    const result = await new Promise<{ error: string; boardId: string }>((resolve) => {
      createRoot(async (dispose) => {
        const [boardId, setBoardId] = createSignal("");
        let error = "";
        const { default: BoardSelector } = await import("./BoardSelector.jsx");
        BoardSelector({
          boardId: boardId(),
          setBoardId,
          onError: (msg: string) => { error = msg; },
          loadBoards: () => Promise.reject(new Error("boards.json not found (500)")),
        });
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
    const result = await new Promise<{ boardId: string }>((resolve) => {
      createRoot(async (dispose) => {
        const [boardId, setBoardId] = createSignal("");
        const { default: BoardSelector } = await import("./BoardSelector.jsx");
        BoardSelector({ boardId: boardId(), setBoardId, loadBoards: async () => boardData });
        await flushMicrotasks();
        resolve({ boardId: boardId() });
        dispose();
      });
    });

    expect(result.boardId).toBe("standard");
  });
});
