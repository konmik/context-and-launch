import { describe, it, expect } from "vitest";
import { createRoot, createSignal } from "solid-js";
import { createCreateTicketController } from "./create-ticket-controller.js";

describe("createCreateTicketController", () => {
  it("seeds number from suggestedNextNumber when open", () => {
    createRoot((dispose) => {
      const ctrl = createCreateTicketController({
        onSubmit: async () => ({}),
        onOpenChange: () => {},
        suggestedNextNumber: () => "42",
        open: () => true,
      });
      expect(ctrl.number()).toBe("42");
      dispose();
    });
  });

  it("does not seed number when not open", () => {
    createRoot((dispose) => {
      const ctrl = createCreateTicketController({
        onSubmit: async () => ({}),
        onOpenChange: () => {},
        suggestedNextNumber: () => "42",
        open: () => false,
      });
      expect(ctrl.number()).toBe("");
      dispose();
    });
  });

  it("doSubmit is a no-op when fields are blank", () => {
    createRoot((dispose) => {
      let called = false;
      const ctrl = createCreateTicketController({
        onSubmit: async () => { called = true; return {}; },
        onOpenChange: () => {},
        suggestedNextNumber: () => null,
        open: () => true,
      });
      ctrl.doSubmit();
      expect(called).toBe(false);
      dispose();
    });
  });

  it("doSubmit calls onSubmit with trimmed values", () => {
    createRoot((dispose) => {
      let submittedNumber = "";
      let submittedTitle = "";
      const ctrl = createCreateTicketController({
        onSubmit: async (num, ttl) => {
          submittedNumber = num;
          submittedTitle = ttl;
          return {};
        },
        onOpenChange: () => {},
        suggestedNextNumber: () => null,
        open: () => true,
      });
      ctrl.setNumber(" 1 ");
      ctrl.setTitle(" Test ");
      ctrl.doSubmit();
      expect(submittedNumber).toBe("1");
      expect(submittedTitle).toBe("Test");
      dispose();
    });
  });

  it("does not overwrite user-edited number when suggestedNextNumber changes while dialog is open", () => {
    const [open, setOpen] = createSignal(false);
    const [suggested, setSuggested] = createSignal<string | null>("ST-005");
    let ctrl!: ReturnType<typeof createCreateTicketController>;
    const dispose = createRoot((dispose) => {
      ctrl = createCreateTicketController({
        onSubmit: async () => ({}),
        onOpenChange: () => {},
        suggestedNextNumber: suggested,
        open,
      });
      return dispose;
    });

    setOpen(true);
    expect(ctrl.number()).toBe("ST-005");

    ctrl.setNumber("CUSTOM-001");
    expect(ctrl.number()).toBe("CUSTOM-001");

    setSuggested("ST-006");
    expect(ctrl.number()).toBe("CUSTOM-001");

    dispose();
  });

  it("close resets fields and calls onOpenChange(false)", () => {
    createRoot((dispose) => {
      let closedOpen = true;
      const ctrl = createCreateTicketController({
        onSubmit: async () => ({}),
        onOpenChange: (open) => { closedOpen = open; },
        suggestedNextNumber: () => null,
        open: () => true,
      });
      ctrl.setNumber("1");
      ctrl.setTitle("Test");
      ctrl.close();
      expect(closedOpen).toBe(false);
      expect(ctrl.number()).toBe("");
      expect(ctrl.title()).toBe("");
      dispose();
    });
  });
});
