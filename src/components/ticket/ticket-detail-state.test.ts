import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot } from "solid-js";

vi.mock("@solidjs/router", () => ({
  revalidate: vi.fn(),
}));

import { createTicketDetailState } from "./ticket-detail-state.js";
import type { TicketInfo } from "~/server/ticket/ticket-store.js";

function makeTicketInfo(overrides?: Partial<TicketInfo>): TicketInfo {
  return {
    number: "T-1",
    title: "Test ticket",
    status: "todo",
    folderName: "001-test-ticket",
    contextNames: ["to-do"],
    useWorktree: false,
    fileNames: [],
    references: [],
    ...overrides,
  };
}

describe("ticket-detail-state cancelFileSwitch clears pendingTab", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ content: "" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })),
    ) as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("cancel tab switch then proceed file switch stays on editor tab", () => {
    createRoot((dispose) => {
      const ticket = makeTicketInfo();
      const ctrl = createTicketDetailState({
        ticket,
        projectSlug: "my-project",
        onClose: vi.fn(),
      });

      ctrl.setContent("unsaved edit");

      expect(ctrl.hasUnsavedFileChanges()).toBe(true);
      expect(ctrl.activeTab()).toBe("editor");

      ctrl.switchTab("launcher");

      expect(ctrl.confirmingFileSwitch()).toBe(true);
      expect(ctrl.activeTab()).toBe("editor");

      ctrl.cancelFileSwitch();

      expect(ctrl.confirmingFileSwitch()).toBe(false);

      const targetFile = { type: "context" as const, name: "product-requirement-document" };
      ctrl.selectFile(targetFile);

      expect(ctrl.confirmingFileSwitch()).toBe(true);

      ctrl.proceedFileSwitch();

      expect(ctrl.activeTab()).toBe("editor");
      expect(ctrl.activeFile()).toEqual(targetFile);

      dispose();
    });
  });
});
