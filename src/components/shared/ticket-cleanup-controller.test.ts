import { describe, it, expect } from "vitest";
import { createRoot } from "solid-js";
import {
  createTicketCleanupController, type TicketCleanupDeps,
} from "./ticket-cleanup-controller.js";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";
import type { TicketCleanupStatus } from "~/core/worktree/ticket-cleanup-checks.js";

function makeTicket(folderName: string): TicketInfo {
  return {
    number: "T-1", title: "Alpha", status: "todo", folderName,
    contextNames: [], useWorktree: false, hasAgentWorktree: false,
    fileNames: [], references: [],
  };
}

const allReady: TicketCleanupStatus = {
  stopHerdrAgent: { state: "ready" },
  deleteWorktree: { state: "ready" },
  deleteLocalBranch: { state: "ready" },
  deleteRemoteBranch: { state: "ready" },
};

function makeDeps(overrides?: Partial<TicketCleanupDeps>): TicketCleanupDeps {
  return {
    projectSlug: () => "alpha",
    ticket: () => makeTicket("t-1-alpha"),
    action: () => "delete",
    loadStatus: async () => allReady,
    onSubmit: async () => ({}),
    onOpenChange: () => {},
    ...overrides,
  };
}

describe("createTicketCleanupController", () => {
  it("shows all items checking while loadStatus is pending", async () => {
    await createRoot(async (dispose) => {
      try {
        let resolve!: (v: TicketCleanupStatus) => void;
        const ctrl = createTicketCleanupController(makeDeps({
          loadStatus: () => new Promise((r) => { resolve = r; }),
        }));
        const p = ctrl.startChecks();
        expect(ctrl.items().stopHerdrAgent.state).toBe("checking");
        expect(ctrl.items().deleteRemoteBranch.state).toBe("checking");
        resolve(allReady);
        await p;
      } finally {
        dispose();
      }
    });
  });

  it("auto-ticks ready items after checks and keeps blocked items unticked", async () => {
    await createRoot(async (dispose) => {
      try {
        const status: TicketCleanupStatus = {
          ...allReady,
          deleteRemoteBranch: { state: "blocked", reason: "No remote branch" },
        };
        const ctrl = createTicketCleanupController(makeDeps({ loadStatus: async () => status }));
        expect(ctrl.isChecked("deleteWorktree")).toBe(false);
        await ctrl.startChecks();
        expect(ctrl.items().deleteRemoteBranch).toEqual({ state: "blocked", reason: "No remote branch" });
        expect(ctrl.isChecked("stopHerdrAgent")).toBe(true);
        expect(ctrl.isChecked("deleteWorktree")).toBe(true);
        expect(ctrl.isChecked("deleteLocalBranch")).toBe(true);
        ctrl.updateOption("deleteRemoteBranch", true);
        expect(ctrl.isChecked("deleteRemoteBranch")).toBe(false);
      } finally {
        dispose();
      }
    });
  });

  it("puts all items in error when loadStatus rejects", async () => {
    await createRoot(async (dispose) => {
      try {
        const ctrl = createTicketCleanupController(makeDeps({
          loadStatus: async () => { throw new Error("server down"); },
        }));
        await ctrl.startChecks();
        expect(ctrl.items().stopHerdrAgent).toEqual({
          state: "error", error: { description: "server down" },
        });
        expect(ctrl.items().deleteRemoteBranch.state).toBe("error");
      } finally {
        dispose();
      }
    });
  });

  it("ignores a stale response for a superseded ticket", async () => {
    await createRoot(async (dispose) => {
      try {
        let resolveA!: (v: TicketCleanupStatus) => void;
        const statusB: TicketCleanupStatus = {
          ...allReady,
          deleteWorktree: { state: "blocked", reason: "No worktree" },
        };
        let call = 0;
        const ctrl = createTicketCleanupController(makeDeps({
          loadStatus: () => {
            call++;
            if (call === 1) return new Promise((r) => { resolveA = r; });
            return Promise.resolve(statusB);
          },
        }));
        const pA = ctrl.startChecks();
        const pB = ctrl.startChecks();
        await pB;
        resolveA(allReady);
        await pA;
        expect(ctrl.items().deleteWorktree).toEqual({ state: "blocked", reason: "No worktree" });
      } finally {
        dispose();
      }
    });
  });

  it("lets updateOption untick a ready item", async () => {
    await createRoot(async (dispose) => {
      try {
        const ctrl = createTicketCleanupController(makeDeps());
        await ctrl.startChecks();
        expect(ctrl.isChecked("deleteWorktree")).toBe(true);
        ctrl.updateOption("deleteWorktree", false);
        expect(ctrl.isChecked("deleteWorktree")).toBe(false);
      } finally {
        dispose();
      }
    });
  });

  it("submits effective options, dropping non-ready keys", async () => {
    await createRoot(async (dispose) => {
      try {
        let submitted: any;
        const status: TicketCleanupStatus = {
          stopHerdrAgent: { state: "blocked", reason: "No Herdr agent" },
          deleteWorktree: { state: "ready" },
          deleteLocalBranch: { state: "blocked", reason: "No local branch" },
          deleteRemoteBranch: { state: "ready" },
        };
        const ctrl = createTicketCleanupController(makeDeps({
          loadStatus: async () => status,
          onSubmit: async (_folder, cleanup) => { submitted = cleanup; return {}; },
        }));
        await ctrl.startChecks();
        await ctrl.doSubmit();
        expect(submitted).toEqual({
          stopHerdrAgent: false,
          deleteWorktree: true,
          deleteLocalBranch: false,
          deleteRemoteBranch: true,
        });
      } finally {
        dispose();
      }
    });
  });

  it("surfaces submit errors and keeps the dialog open", async () => {
    await createRoot(async (dispose) => {
      try {
        let closedWith: boolean | undefined;
        const ctrl = createTicketCleanupController(makeDeps({
          onOpenChange: (open) => { closedWith = open; },
          onSubmit: async () => ({ error: "cleanup failed" }),
        }));
        await ctrl.startChecks();
        await ctrl.doSubmit();
        expect(ctrl.errorInfo()).toEqual({ description: "cleanup failed" });
        expect(closedWith).toBeUndefined();
      } finally {
        dispose();
      }
    });
  });

  it("closes the dialog on a successful submit", async () => {
    await createRoot(async (dispose) => {
      try {
        let closedWith: boolean | undefined;
        const ctrl = createTicketCleanupController(makeDeps({
          onOpenChange: (open) => { closedWith = open; },
        }));
        await ctrl.startChecks();
        await ctrl.doSubmit();
        expect(closedWith).toBe(false);
        expect(ctrl.items().deleteWorktree.state).toBe("checking");
        expect(ctrl.isChecked("deleteWorktree")).toBe(false);
      } finally {
        dispose();
      }
    });
  });

  it("tracks submitting during an in-flight submit", async () => {
    await createRoot(async (dispose) => {
      try {
        let resolve!: (v: { error?: string }) => void;
        const ctrl = createTicketCleanupController(makeDeps({
          onSubmit: () => new Promise((r) => { resolve = r; }),
        }));
        await ctrl.startChecks();
        const p = ctrl.doSubmit();
        expect(ctrl.submitting()).toBe(true);
        resolve({});
        await p;
        expect(ctrl.submitting()).toBe(false);
      } finally {
        dispose();
      }
    });
  });
});
