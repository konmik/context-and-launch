import { createSignal } from "solid-js";
import { revalidate } from "@solidjs/router";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";
import type { ErrorInfo } from "~/core/shared/errors.js";
import {
  createTicket, deleteTicket, archiveTicket,
  reorderTicket, syncTickets, worktreeCleanup,
} from "../ticket/ticket-api.js";
import { deleteProject, projectSyncRevalidateKeys } from "./project-api.js";
import type { ProjectPageData, SyncStatus } from "./project-api.js";
import { resolveConflicts, abortRebase } from "../launcher/launcher-api.js";
import { parseSyncResult } from "./project-page-pure.js";
import type { TicketCleanupOptions } from "../shared/ticket-cleanup-pure.js";

export interface ProjectPageDeps {
  projectSlug: () => string;
  data: () => ProjectPageData | undefined;
  syncStatus: () => SyncStatus | undefined;
}

export function createProjectPageController(deps: ProjectPageDeps) {
  const [addProjectDialogOpen, setAddProjectDialogOpen] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [createTicketOpen, setCreateTicketOpen] = createSignal(false);
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
    const ss = deps.syncStatus();
    if (ss && !ss.hasRemote) {
      setSyncError({
        title: "Sync failed",
        description: "No remote tracking branch configured."
          + " Push the ticket branch to a remote first.",
      });
      return;
    }
    setSyncing(true);
    setSyncError(null);
    try {
      const result = await syncTickets(deps.projectSlug());
      if (!result.ok) {
        setSyncError({ title: "Sync failed", description: result.message });
      } else {
        const parsed = parseSyncResult(result);
        if (parsed.type === "success") {
          setSyncSuccess(true);
          setTimeout(() => setSyncSuccess(false), 2000);
          await revalidate(projectSyncRevalidateKeys);
        } else if (parsed.type === "conflict") {
          await revalidate(projectSyncRevalidateKeys);
          setConflictDialogOpen(true);
        } else {
          setSyncError({ title: "Sync failed", description: parsed.message });
        }
      }
    } catch (err) {
      setSyncError({ title: "Sync failed", description: err instanceof Error ? err.message : "Sync failed" });
    } finally {
      setSyncing(false);
    }
  }

  async function handleConflictResolve(profileName: string) {
    const result = await resolveConflicts(deps.projectSlug(), profileName);
    if (!result.ok) throw new Error(result.message);
    await revalidate(projectSyncRevalidateKeys);
  }

  async function handleConflictAbort() {
    const result = await abortRebase(deps.projectSlug());
    if (!result.ok) throw new Error(result.message);
    await revalidate(projectSyncRevalidateKeys);
  }

  function openDelete(ticket: TicketInfo) {
    setSelectedTicket(ticket);
    setCleanupAction("delete");
    setCleanupDialogOpen(true);
  }

  function openArchive(ticket: TicketInfo) {
    setSelectedTicket(ticket);
    setCleanupAction("archive");
    setCleanupDialogOpen(true);
  }

  function openDetail(ticket: TicketInfo) {
    setDetailTicket(ticket);
  }

  async function handleCreateTicket(number: string, title: string) {
    const result = await createTicket(deps.projectSlug(), number, title);
    if (result.ok) revalidate("project-page");
    return result.ok ? {} : { error: result.message };
  }

  async function handleArchiveTicket(folderName: string) {
    const result = await archiveTicket(deps.projectSlug(), folderName);
    if (result.ok) revalidate("project-page");
    return result.ok ? {} : { error: result.message };
  }

  async function handleDeleteTicket(folderName: string) {
    const result = await deleteTicket(deps.projectSlug(), folderName);
    if (result.ok) revalidate("project-page");
    return result.ok ? {} : { error: result.message };
  }

  async function handleDeleteProject(projectSlug: string) {
    const result = await deleteProject(projectSlug);
    if (result.ok) revalidate("project-page");
    return result.ok ? {} : { error: result.message };
  }

  async function handleReorder(
    folderName: string, fromColumn: string, toColumn: string, newIndex: number,
  ) {
    const result = await reorderTicket(deps.projectSlug(), folderName, fromColumn, toColumn, newIndex);
    if (result.ok) revalidate("project-page");
  }

  async function handleCleanupSubmit(
    folderName: string,
  ) {
    return cleanupAction() === "archive"
      ? await handleArchiveTicket(folderName)
      : await handleDeleteTicket(folderName);
  }

  async function handleCleanupAction(
    folderName: string,
    options: TicketCleanupOptions,
  ) {
    const cleanupResult = await worktreeCleanup(deps.projectSlug(), folderName, options);
    if (!cleanupResult.ok) {
      const info = 'errorInfo' in cleanupResult ? cleanupResult.errorInfo : undefined;
      return { error: info ?? cleanupResult.message };
    }
    return {};
  }

  const dialogState = () => ({
    createTicketOpen: createTicketOpen(),
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
    openDelete,
    openArchive,
    openDetail,
    closeDetail: () => setDetailTicket(null),
    handleSync,
    handleConflictResolve,
    handleConflictAbort,
    handleReorder,
    handleCreateTicket,
    handleCleanupAction,
    handleCleanupSubmit,
    openSettings: () => setSettingsOpen(true),
    closeSettings: () => setSettingsOpen(false),
    openAddProject: () => setAddProjectDialogOpen(true),
    closeAddProject: () => setAddProjectDialogOpen(false),
    handleDeleteProject,
    setCreateTicketOpen,
    setCleanupDialogOpen,
    setConflictDialogOpen,
    setSyncError,
  };

  return { dialogState, syncState, selectionState, commands };
}

export type ProjectPageController = ReturnType<typeof createProjectPageController>;
