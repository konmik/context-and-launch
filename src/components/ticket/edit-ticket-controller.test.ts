import { describe, it, expect } from "vitest";
import { createRoot } from "solid-js";
import { createEditTicketController } from "./edit-ticket-controller.js";
import type { TicketInfo } from "~/server/ticket/ticket-store.js";

const ticket: TicketInfo = {
  number: "T-1",
  title: "Original Title",
  status: "todo",
  folderName: "001-original",
  contextNames: [],
  useWorktree: false,
  fileNames: [],
  references: [],
};

describe("createEditTicketController", () => {
  it("seeds fields from ticket when open", () => {
    createRoot((dispose) => {
      const ctrl = createEditTicketController({
        onSubmit: async () => ({}),
        onOpenChange: () => {},
        ticket: () => ticket,
        open: () => true,
      });
      expect(ctrl.number()).toBe("T-1");
      expect(ctrl.title()).toBe("Original Title");
      dispose();
    });
  });

  it("does not seed fields when ticket is null", () => {
    createRoot((dispose) => {
      const ctrl = createEditTicketController({
        onSubmit: async () => ({}),
        onOpenChange: () => {},
        ticket: () => null,
        open: () => true,
      });
      expect(ctrl.number()).toBe("");
      expect(ctrl.title()).toBe("");
      dispose();
    });
  });

  it("doSubmit is a no-op when ticket is null", () => {
    createRoot((dispose) => {
      let called = false;
      const ctrl = createEditTicketController({
        onSubmit: async () => { called = true; return {}; },
        onOpenChange: () => {},
        ticket: () => null,
        open: () => true,
      });
      ctrl.setNumber("1");
      ctrl.setTitle("Test");
      ctrl.doSubmit();
      expect(called).toBe(false);
      dispose();
    });
  });

  it("doSubmit calls onSubmit with folderName and trimmed values", () => {
    createRoot((dispose) => {
      let submittedFolderName = "";
      let submittedNumber = "";
      const ctrl = createEditTicketController({
        onSubmit: async (fn, num) => {
          submittedFolderName = fn;
          submittedNumber = num;
          return {};
        },
        onOpenChange: () => {},
        ticket: () => ticket,
        open: () => true,
      });
      ctrl.doSubmit();
      expect(submittedFolderName).toBe("001-original");
      expect(submittedNumber).toBe("T-1");
      dispose();
    });
  });

  it("close calls onOpenChange(false)", () => {
    createRoot((dispose) => {
      let closedOpen = true;
      const ctrl = createEditTicketController({
        onSubmit: async () => ({}),
        onOpenChange: (open) => { closedOpen = open; },
        ticket: () => ticket,
        open: () => true,
      });
      ctrl.close();
      expect(closedOpen).toBe(false);
      dispose();
    });
  });

});
