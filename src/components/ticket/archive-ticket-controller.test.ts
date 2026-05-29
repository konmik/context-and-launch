import { describe, it, expect } from "vitest";
import { createRoot } from "solid-js";
import { createArchiveTicketController } from "./archive-ticket-controller.js";
import type { TicketInfo } from "~/server/ticket/ticket-store.js";

const ticket: TicketInfo = {
  number: "T-1",
  title: "Test",
  status: "todo",
  folderName: "001-test",
  contextNames: [],
  useWorktree: false,
  fileNames: [],
  references: [],
};

function fakeEvent(): SubmitEvent {
  return { preventDefault: () => {} } as unknown as SubmitEvent;
}

describe("createArchiveTicketController", () => {
  it("handleSubmit is a no-op when ticket is null", () => {
    createRoot((dispose) => {
      let called = false;
      const ctrl = createArchiveTicketController({
        onSubmit: async () => { called = true; return {}; },
        onOpenChange: () => {},
        ticket: () => null,
      });
      ctrl.handleSubmit(fakeEvent());
      expect(called).toBe(false);
      dispose();
    });
  });

  it("handleSubmit calls onSubmit with folderName", () => {
    createRoot((dispose) => {
      let submittedFolderName = "";
      const ctrl = createArchiveTicketController({
        onSubmit: async (fn) => {
          submittedFolderName = fn;
          return {};
        },
        onOpenChange: () => {},
        ticket: () => ticket,
      });
      ctrl.handleSubmit(fakeEvent());
      expect(submittedFolderName).toBe("001-test");
      dispose();
    });
  });

  it("close calls onOpenChange(false)", () => {
    createRoot((dispose) => {
      let closedOpen = true;
      const ctrl = createArchiveTicketController({
        onSubmit: async () => ({}),
        onOpenChange: (open) => { closedOpen = open; },
        ticket: () => ticket,
      });
      ctrl.close();
      expect(closedOpen).toBe(false);
      dispose();
    });
  });
});
