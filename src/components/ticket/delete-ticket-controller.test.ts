import { describe, it, expect } from "vitest";
import { createRoot } from "solid-js";
import { createDeleteTicketController } from "./delete-ticket-controller.js";
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

describe("createDeleteTicketController", () => {
  it("doSubmit is a no-op when ticket is null", () => {
    createRoot((dispose) => {
      let called = false;
      const ctrl = createDeleteTicketController({
        onSubmit: async () => { called = true; return {}; },
        onOpenChange: () => {},
        ticket: () => null,
      });
      ctrl.doSubmit();
      expect(called).toBe(false);
      dispose();
    });
  });

  it("doSubmit calls onSubmit with folderName", () => {
    createRoot((dispose) => {
      let submittedFolderName = "";
      const ctrl = createDeleteTicketController({
        onSubmit: async (fn) => {
          submittedFolderName = fn;
          return {};
        },
        onOpenChange: () => {},
        ticket: () => ticket,
      });
      ctrl.doSubmit();
      expect(submittedFolderName).toBe("001-test");
      dispose();
    });
  });

  it("close calls onOpenChange(false)", () => {
    createRoot((dispose) => {
      let closedOpen = true;
      const ctrl = createDeleteTicketController({
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
