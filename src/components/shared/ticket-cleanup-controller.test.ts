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
    onCleanup: async () => ({}),
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

  it("loads ready and blocked action states", async () => {
    await createRoot(async (dispose) => {
      try {
        const status: TicketCleanupStatus = {
          ...allReady,
          deleteRemoteBranch: { state: "blocked", reason: "No remote branch" },
        };
        const ctrl = createTicketCleanupController(makeDeps({ loadStatus: async () => status }));
        await ctrl.startChecks();
        expect(ctrl.items().deleteRemoteBranch).toEqual({ state: "blocked", reason: "No remote branch" });
        expect(ctrl.items().stopHerdrAgent).toEqual({ state: "ready" });
        expect(ctrl.items().deleteWorktree).toEqual({ state: "ready" });
        expect(ctrl.items().deleteLocalBranch).toEqual({ state: "ready" });
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

  it("runs one cleanup action and refreshes all statuses", async () => {
    await createRoot(async (dispose) => {
      try {
        let submitted: any;
        let checks = 0;
        const refreshed: TicketCleanupStatus = {
          ...allReady,
          deleteWorktree: { state: "blocked", reason: "No worktree" },
        };
        const ctrl = createTicketCleanupController(makeDeps({
          loadStatus: async () => ++checks === 1 ? allReady : refreshed,
          onCleanup: async (_folderName, cleanup) => { submitted = cleanup; return {}; },
        }));
        await ctrl.startChecks();
        await ctrl.runCleanup("deleteWorktree");
        expect(submitted).toEqual({
          stopHerdrAgent: false,
          deleteWorktree: true,
          deleteLocalBranch: false,
          deleteRemoteBranch: false,
        });
        expect(checks).toBe(2);
        expect(ctrl.items()).toEqual(refreshed);
      } finally {
        dispose();
      }
    });
  });

  it("submits the final ticket action without cleanup options", async () => {
    await createRoot(async (dispose) => {
      try {
        let submittedFolderName: string | undefined;
        const ctrl = createTicketCleanupController(makeDeps({
          onSubmit: async (folderName) => { submittedFolderName = folderName; return {}; },
        }));
        await ctrl.startChecks();
        await ctrl.doSubmit();
        expect(submittedFolderName).toBe("t-1-alpha");
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

  it("tracks a running cleanup and refreshes after it settles", async () => {
    await createRoot(async (dispose) => {
      try {
        let resolve!: (v: { error?: string }) => void;
        const ctrl = createTicketCleanupController(makeDeps({
          onCleanup: () => new Promise((r) => { resolve = r; }),
        }));
        await ctrl.startChecks();
        const p = ctrl.runCleanup("deleteWorktree");
        expect(ctrl.runningItem()).toBe("deleteWorktree");
        expect(ctrl.busy()).toBe(true);
        resolve({});
        await p;
        expect(ctrl.runningItem()).toBeUndefined();
        expect(ctrl.busy()).toBe(false);
      } finally {
        dispose();
      }
    });
  });

  it("refreshes statuses and surfaces a cleanup action error", async () => {
    await createRoot(async (dispose) => {
      try {
        let checks = 0;
        const ctrl = createTicketCleanupController(makeDeps({
          loadStatus: async () => { checks++; return allReady; },
          onCleanup: async () => ({ error: "action failed" }),
        }));
        await ctrl.startChecks();
        await ctrl.runCleanup("deleteWorktree");
        expect(checks).toBe(2);
        expect(ctrl.errorInfo()).toEqual({ description: "action failed" });
      } finally {
        dispose();
      }
    });
  });
});
