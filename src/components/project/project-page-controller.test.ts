import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot, createSignal } from "solid-js";
import {
  createProjectPageController,
  type ProjectPageDeps,
} from "./project-page-controller.js";
import type { TicketInfo } from "~/server/ticket/ticket-store.js";

function makeTicket(overrides: Partial<TicketInfo> & { folderName: string }): TicketInfo {
  return {
    number: overrides.number ?? "T-1",
    title: overrides.title ?? "Test ticket",
    status: overrides.status ?? "todo",
    contextNames: [],
    useWorktree: false,
    fileNames: [],
    references: [],
    ...overrides,
  };
}

function makeDeps(overrides?: Partial<ProjectPageDeps>): ProjectPageDeps {
  return {
    projectSlug: () => "test-project",
    data: () => ({
      status: "loaded",
      hasRemote: true,
      board: { tickets: [] },
    }),
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("createProjectPageController dialog commands", () => {
  it("openCreate sets createTicketOpen to true", () => {
    createRoot((dispose) => {
      const ctrl = createProjectPageController(makeDeps());
      expect(ctrl.dialogState().createTicketOpen).toBe(false);
      ctrl.commands.openCreate();
      expect(ctrl.dialogState().createTicketOpen).toBe(true);
      dispose();
    });
  });

  it("openEdit sets selectedTicket and editTicketOpen", () => {
    createRoot((dispose) => {
      const ticket = makeTicket({ folderName: "001-test" });
      const ctrl = createProjectPageController(makeDeps());
      ctrl.commands.openEdit(ticket);
      expect(ctrl.selectionState().selectedTicket).toBe(ticket);
      expect(ctrl.dialogState().editTicketOpen).toBe(true);
      dispose();
    });
  });

  it("openDelete without worktree opens deleteTicketOpen", () => {
    createRoot((dispose) => {
      const ticket = makeTicket({ folderName: "001-test", useWorktree: false });
      const ctrl = createProjectPageController(makeDeps());
      ctrl.commands.openDelete(ticket);
      expect(ctrl.dialogState().deleteTicketOpen).toBe(true);
      expect(ctrl.dialogState().cleanupDialogOpen).toBe(false);
      dispose();
    });
  });

  it("openDelete with worktree opens cleanupDialog with delete action", () => {
    createRoot((dispose) => {
      const ticket = makeTicket({ folderName: "001-test", useWorktree: true });
      const ctrl = createProjectPageController(makeDeps());
      ctrl.commands.openDelete(ticket);
      expect(ctrl.dialogState().deleteTicketOpen).toBe(false);
      expect(ctrl.dialogState().cleanupDialogOpen).toBe(true);
      expect(ctrl.dialogState().cleanupAction).toBe("delete");
      dispose();
    });
  });

  it("openArchive without worktree opens archiveTicketOpen", () => {
    createRoot((dispose) => {
      const ticket = makeTicket({ folderName: "001-test", useWorktree: false });
      const ctrl = createProjectPageController(makeDeps());
      ctrl.commands.openArchive(ticket);
      expect(ctrl.dialogState().archiveTicketOpen).toBe(true);
      expect(ctrl.dialogState().cleanupDialogOpen).toBe(false);
      dispose();
    });
  });

  it("openArchive with worktree opens cleanupDialog with archive action", () => {
    createRoot((dispose) => {
      const ticket = makeTicket({ folderName: "001-test", useWorktree: true });
      const ctrl = createProjectPageController(makeDeps());
      ctrl.commands.openArchive(ticket);
      expect(ctrl.dialogState().archiveTicketOpen).toBe(false);
      expect(ctrl.dialogState().cleanupDialogOpen).toBe(true);
      expect(ctrl.dialogState().cleanupAction).toBe("archive");
      dispose();
    });
  });

  it("openSettings and closeSettings toggle settingsOpen", () => {
    createRoot((dispose) => {
      const ctrl = createProjectPageController(makeDeps());
      expect(ctrl.dialogState().settingsOpen).toBe(false);
      ctrl.commands.openSettings();
      expect(ctrl.dialogState().settingsOpen).toBe(true);
      ctrl.commands.closeSettings();
      expect(ctrl.dialogState().settingsOpen).toBe(false);
      dispose();
    });
  });

  it("openAddProject and closeAddProject toggle addProjectDialogOpen", () => {
    createRoot((dispose) => {
      const ctrl = createProjectPageController(makeDeps());
      expect(ctrl.dialogState().addProjectDialogOpen).toBe(false);
      ctrl.commands.openAddProject();
      expect(ctrl.dialogState().addProjectDialogOpen).toBe(true);
      ctrl.commands.closeAddProject();
      expect(ctrl.dialogState().addProjectDialogOpen).toBe(false);
      dispose();
    });
  });

  it("closeDetail sets detailTicket to null", () => {
    createRoot((dispose) => {
      const ctrl = createProjectPageController(makeDeps());
      ctrl.commands.closeDetail();
      expect(ctrl.selectionState().detailTicket).toBe(null);
      dispose();
    });
  });
});

describe("createProjectPageController sync", () => {
  it("handleSync sets syncError when no remote", async () => {
    await createRoot(async (dispose) => {
      const ctrl = createProjectPageController(makeDeps({
        data: () => ({ status: "loaded", hasRemote: false, board: { tickets: [] } }),
      }));
      await ctrl.commands.handleSync();
      expect(ctrl.syncState().syncError).not.toBe(null);
      expect(ctrl.syncState().syncError?.description).toContain("No remote");
      dispose();
    });
  });

  it("handleSync does nothing when data status is not loaded", async () => {
    await createRoot(async (dispose) => {
      const ctrl = createProjectPageController(makeDeps({
        data: () => ({ status: "not-found" }),
      }));
      await ctrl.commands.handleSync();
      expect(ctrl.syncState().syncing).toBe(false);
      expect(ctrl.syncState().syncError).toBe(null);
      dispose();
    });
  });
});

describe("createProjectPageController ticket actions", () => {
  it("handleCreateTicket calls fetch with correct URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await createRoot(async (dispose) => {
      const ctrl = createProjectPageController(makeDeps());
      const result = await ctrl.commands.handleCreateTicket("T-1", "My ticket");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/projects/test-project/board/tickets",
        expect.objectContaining({ method: "POST" }),
      );
      expect(result.error).toBeUndefined();
      dispose();
    });
  });

  it("handleEditTicket calls fetch with folder name in URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await createRoot(async (dispose) => {
      const ctrl = createProjectPageController(makeDeps());
      await ctrl.commands.handleEditTicket("001-ticket", "T-1", "New title");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/projects/test-project/board/tickets/001-ticket",
        expect.objectContaining({ method: "PUT" }),
      );
      dispose();
    });
  });

  it("handleDeleteTicket calls fetch with DELETE method", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await createRoot(async (dispose) => {
      const ctrl = createProjectPageController(makeDeps());
      await ctrl.commands.handleDeleteTicket("001-ticket");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/projects/test-project/board/tickets/001-ticket",
        expect.objectContaining({ method: "DELETE" }),
      );
      dispose();
    });
  });

  it("handleArchiveTicket calls fetch with archive URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await createRoot(async (dispose) => {
      const ctrl = createProjectPageController(makeDeps());
      await ctrl.commands.handleArchiveTicket("001-ticket");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/projects/test-project/board/tickets/001-ticket/archive",
        expect.objectContaining({ method: "POST" }),
      );
      dispose();
    });
  });

  it("handleCleanupSubmit with cleanup options calls worktree-cleanup then archive", async () => {
    const callOrder: string[] = [];
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      callOrder.push(url);
      return Promise.resolve({
        json: () => Promise.resolve({ success: true }),
      });
    });
    vi.stubGlobal("fetch", mockFetch);

    await createRoot(async (dispose) => {
      const ticket = makeTicket({ folderName: "001-ticket", useWorktree: true });
      const ctrl = createProjectPageController(makeDeps());
      ctrl.commands.openArchive(ticket);

      const result = await ctrl.commands.handleCleanupSubmit("001-ticket", {
        deleteWorktree: true,
        deleteLocalBranch: false,
        deleteRemoteBranch: false,
      });

      expect(result.error).toBeUndefined();
      expect(callOrder).toEqual([
        "/api/projects/test-project/worktree-cleanup",
        "/api/projects/test-project/board/tickets/001-ticket/archive",
      ]);
      dispose();
    });
  });

  it("handleCleanupSubmit calls worktree-cleanup then delete when cleanupAction is delete", async () => {
    const callOrder: { url: string; method: string }[] = [];
    const mockFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      callOrder.push({ url, method: init?.method ?? "GET" });
      return Promise.resolve({
        json: () => Promise.resolve({ success: true }),
      });
    });
    vi.stubGlobal("fetch", mockFetch);

    await createRoot(async (dispose) => {
      const ticket = makeTicket({ folderName: "001-ticket", useWorktree: true });
      const ctrl = createProjectPageController(makeDeps());
      ctrl.commands.openDelete(ticket);

      const result = await ctrl.commands.handleCleanupSubmit("001-ticket", {
        deleteWorktree: true,
        deleteLocalBranch: false,
        deleteRemoteBranch: false,
      });

      expect(result.error).toBeUndefined();
      expect(callOrder).toEqual([
        { url: "/api/projects/test-project/worktree-cleanup", method: "POST" },
        { url: "/api/projects/test-project/board/tickets/001-ticket", method: "DELETE" },
      ]);
      dispose();
    });
  });

});
