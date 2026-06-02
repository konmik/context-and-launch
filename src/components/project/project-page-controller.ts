import { createSignal } from "solid-js";
import { revalidate } from "@solidjs/router";
import type { TicketInfo } from "~/server/ticket/ticket-store.js";
import type { ErrorInfo } from "~/server/shared/errors.js";
import { apiFetch } from "~/lib/api.js";
import { deleteProjectAction } from "~/lib/delete-project.js";
import { parseSyncResult } from "./project-page-pure.js";

export interface ProjectPageDeps {
  projectSlug: () => string;
  data: () => { status: string; hasRemote?: boolean; board?: { tickets: TicketInfo[] } } | undefined;
}

export function createProjectPageController(deps: ProjectPageDeps) {
  const [addProjectDialogOpen, setAddProjectDialogOpen] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [createTicketOpen, setCreateTicketOpen] = createSignal(false);
  const [editTicketOpen, setEditTicketOpen] = createSignal(false);
  const [deleteTicketOpen, setDeleteTicketOpen] = createSignal(false);
  const [archiveTicketOpen, setArchiveTicketOpen] = createSignal(false);
  const [cleanupDialogOpen, setCleanupDialogOpen] = createSignal(false);
  const [cleanupAction, setCleanupAction] = createSignal<"archive" | "delete">("archive");
  const [selectedTicket, setSelectedTicket] = createSignal<TicketInfo | null>(null);
  const [detailTicket, setDetailTicket] = createSignal<TicketInfo | null>(null);
  const [syncing, setSyncing] = createSignal(false);
  const [syncSuccess, setSyncSuccess] = createSignal(false);
  const [syncError, setSyncError] = createSignal<ErrorInfo | null>(null);
  const [conflictDialogOpen, setConflictDialogOpen] = createSignal(false);

  async function handleSync() {
    if (syncing()) return;
    const d = deps.data();
    if (!d || d.status !== "loaded") return;
    if (!d.hasRemote) {
      setSyncError({ description: "No remote tracking branch configured. Push the ticket branch to a remote first." });
      return;
    }
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch(`/api/projects/${deps.projectSlug()}/board/sync`, { method: "POST" });
      const result = await res.json();
      const parsed = parseSyncResult(result);
      if (parsed.type === "success") {
        setSyncSuccess(true);
        setTimeout(() => setSyncSuccess(false), 2000);
        await revalidate("project-page");
      } else if (parsed.type === "conflict") {
        setConflictDialogOpen(true);
      } else {
        setSyncError({ description: parsed.message });
      }
    } catch (err) {
      setSyncError({ description: err instanceof Error ? err.message : "Sync failed" });
    } finally {
      setSyncing(false);
    }
  }

  async function handleConflictResolve(profileName: string) {
    const res = await fetch(`/api/projects/${deps.projectSlug()}/board/resolve-conflicts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileName }),
    });
    if (!res.ok) {
      const body = await res.json();
      throw new Error(body.error || "Failed to launch resolver");
    }
    await revalidate("project-page");
  }

  async function handleConflictAbort() {
    const res = await fetch(`/api/projects/${deps.projectSlug()}/board/sync`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json();
      throw new Error(body.error || "Failed to abort rebase");
    }
    await revalidate("project-page");
  }

  function openEdit(ticket: TicketInfo) {
    setSelectedTicket(ticket);
    setEditTicketOpen(true);
  }

  function openDelete(ticket: TicketInfo) {
    setSelectedTicket(ticket);
    if (ticket.useWorktree) {
      setCleanupAction("delete");
      setCleanupDialogOpen(true);
    } else {
      setDeleteTicketOpen(true);
    }
  }

  function openArchive(ticket: TicketInfo) {
    setSelectedTicket(ticket);
    if (ticket.useWorktree) {
      setCleanupAction("archive");
      setCleanupDialogOpen(true);
    } else {
      setArchiveTicketOpen(true);
    }
  }

  async function openDetail(ticket: TicketInfo) {
    await revalidate("project-page");
    const d = deps.data();
    const board = d?.status === "loaded" ? (d as any).board : undefined;
    const fresh = board?.tickets.find((t: TicketInfo) => t.folderName === ticket.folderName);
    setDetailTicket(fresh ?? ticket);
  }

  async function ticketAction(url: string, init?: RequestInit) {
    const result = await apiFetch(url, init);
    if (!result.error) revalidate("project-page");
    return result;
  }

  async function handleCreateTicket(number: string, title: string) {
    const base = `/api/projects/${deps.projectSlug()}/board/tickets`;
    return ticketAction(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ number, title }),
    });
  }

  async function handleEditTicket(folderName: string, number: string, title: string) {
    return ticketAction(`/api/projects/${deps.projectSlug()}/board/tickets/${folderName}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ number, title }),
    });
  }

  async function handleArchiveTicket(folderName: string) {
    return ticketAction(`/api/projects/${deps.projectSlug()}/board/tickets/${folderName}/archive`, {
      method: "POST",
    });
  }

  async function handleDeleteTicket(folderName: string) {
    return ticketAction(`/api/projects/${deps.projectSlug()}/board/tickets/${folderName}`, {
      method: "DELETE",
    });
  }

  async function handleDeleteProject(projectSlug: string) {
    return deleteProjectAction(projectSlug);
  }

  async function handleReorder(
    folderName: string, fromColumn: string, toColumn: string, newIndex: number,
  ) {
    const res = await fetch(`/api/projects/${deps.projectSlug()}/board/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderName, fromColumn, toColumn, newIndex }),
    });
    if (res.ok) await revalidate("project-page");
  }

  async function handleCleanupSubmit(
    folderName: string,
    options: { deleteWorktree: boolean; deleteLocalBranch: boolean; deleteRemoteBranch: boolean },
  ) {
    if (options.deleteWorktree || options.deleteLocalBranch || options.deleteRemoteBranch) {
      const cleanupResult = await apiFetch(`/api/projects/${deps.projectSlug()}/worktree-cleanup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderName, options }),
      });
      if (cleanupResult.error) return cleanupResult;
    }
    const action = cleanupAction();
    return action === "archive"
      ? await handleArchiveTicket(folderName)
      : await handleDeleteTicket(folderName);
  }

  const dialogState = () => ({
    createTicketOpen: createTicketOpen(),
    editTicketOpen: editTicketOpen(),
    deleteTicketOpen: deleteTicketOpen(),
    archiveTicketOpen: archiveTicketOpen(),
    cleanupDialogOpen: cleanupDialogOpen(),
    cleanupAction: cleanupAction(),
    settingsOpen: settingsOpen(),
    addProjectDialogOpen: addProjectDialogOpen(),
    conflictDialogOpen: conflictDialogOpen(),
  });

  const syncState = () => ({
    syncing: syncing(),
    syncSuccess: syncSuccess(),
    syncError: syncError(),
  });

  const selectionState = () => ({
    selectedTicket: selectedTicket(),
    detailTicket: detailTicket(),
  });

  const commands = {
    openCreate: () => setCreateTicketOpen(true),
    openEdit,
    openDelete,
    openArchive,
    openDetail,
    closeDetail: () => setDetailTicket(null),
    handleSync,
    handleConflictResolve,
    handleConflictAbort,
    handleReorder,
    handleCreateTicket,
    handleEditTicket,
    handleArchiveTicket,
    handleDeleteTicket,
    handleCleanupSubmit,
    openSettings: () => setSettingsOpen(true),
    closeSettings: () => setSettingsOpen(false),
    openAddProject: () => setAddProjectDialogOpen(true),
    closeAddProject: () => setAddProjectDialogOpen(false),
    handleDeleteProject,
    setCreateTicketOpen,
    setEditTicketOpen,
    setDeleteTicketOpen,
    setArchiveTicketOpen,
    setCleanupDialogOpen,
    setConflictDialogOpen,
    setSyncError,
  };

  return { dialogState, syncState, selectionState, commands };
}

export type ProjectPageController = ReturnType<typeof createProjectPageController>;
