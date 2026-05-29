import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "solid-js";
import {
  createConflictDialogController,
  type ConflictDialogDeps,
} from "./conflict-dialog-controller.js";

function makeDeps(overrides?: Partial<ConflictDialogDeps>): ConflictDialogDeps {
  return {
    projectSlug: () => "test-project",
    open: () => true,
    onResolve: async () => {},
    onAbort: async () => {},
    onOpenChange: () => {},
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("createConflictDialogController", () => {
  it("close calls onOpenChange(false) and clears error", () => {
    createRoot((dispose) => {
      let openChangedTo: boolean | undefined;
      const ctrl = createConflictDialogController(makeDeps({
        onOpenChange: (open) => { openChangedTo = open; },
      }));
      ctrl.close();
      expect(openChangedTo).toBe(false);
      expect(ctrl.errorMsg()).toBe("");
      dispose();
    });
  });

  it("resolve calls onResolve with selected profile", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ profiles: [{ name: "fast" }] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await createRoot(async (dispose) => {
      let resolvedProfile = "";
      let closed = false;
      const ctrl = createConflictDialogController(makeDeps({
        onResolve: async (profileName) => { resolvedProfile = profileName; },
        onOpenChange: (open) => { if (!open) closed = true; },
      }));
      ctrl.setSelectedProfile("fast");
      await ctrl.resolve();
      expect(resolvedProfile).toBe("fast");
      expect(closed).toBe(true);
      expect(ctrl.submitting()).toBe(false);
      dispose();
    });
  });

  it("resolve sets errorMsg when onResolve throws", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ profiles: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await createRoot(async (dispose) => {
      const ctrl = createConflictDialogController(makeDeps({
        onResolve: async () => { throw new Error("Failed to launch resolver"); },
      }));
      await ctrl.resolve();
      expect(ctrl.errorMsg()).toBe("Failed to launch resolver");
      expect(ctrl.submitting()).toBe(false);
      dispose();
    });
  });

  it("abort calls onAbort and closes on success", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ profiles: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await createRoot(async (dispose) => {
      let aborted = false;
      let closed = false;
      const ctrl = createConflictDialogController(makeDeps({
        onAbort: async () => { aborted = true; },
        onOpenChange: (open) => { if (!open) closed = true; },
      }));
      await ctrl.abort();
      expect(aborted).toBe(true);
      expect(closed).toBe(true);
      expect(ctrl.submitting()).toBe(false);
      dispose();
    });
  });

  it("abort sets errorMsg when onAbort throws", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ profiles: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await createRoot(async (dispose) => {
      const ctrl = createConflictDialogController(makeDeps({
        onAbort: async () => { throw new Error("Abort failed"); },
      }));
      await ctrl.abort();
      expect(ctrl.errorMsg()).toBe("Abort failed");
      expect(ctrl.submitting()).toBe(false);
      dispose();
    });
  });

  it("profiles are initially empty", () => {
    createRoot((dispose) => {
      const ctrl = createConflictDialogController(makeDeps({
        open: () => false,
      }));
      expect(ctrl.profiles()).toEqual([]);
      dispose();
    });
  });
});
