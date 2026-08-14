import { createSignal, flush } from "solid-js";
import { revalidate, useAction } from "@solidjs/router";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";
import type { ErrorInfo } from "~/core/shared/errors.js";
import {
  createTicket, deleteTicket, archiveTicket,
  reorderTicket, syncTickets, worktreeCleanup,
} from "../ticket/ticket-api.js";
import { deleteProject, getSyncStatus } from "./project-api.js";
import {
  ticketMutationRevalidateKeys, projectSyncRevalidateKeys,
} from "../shared/revalidate-keys.js";
import type { ProjectPageData } from "./project-api.js";
import { resolveConflicts, abortRebase } from "../launcher/launcher-api.js";
import { parseSyncResult } from "./project-page-pure.js";
import type { TicketCleanupOptions } from "../shared/ticket-cleanup-pure.js";

export interface ProjectPageDeps {
  projectSlug: () => string;
  data: () => ProjectPageData | undefined;
}

export function createProjectPageController(deps: ProjectPageDeps) {
  const [addProjectDialogOpen, setAddProjectDialogOpen] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [createTicketOpen, setCreateTicketOpen] = createSignal(false);
  const [cleanupDialogOpen, setCleanupDialogOpen] = createSignal(false);
  const [cleanupAction, setCleanupAction] = createSignal<"archive" | "delete">("archive");
  const [selectedTicket, setSelectedTicket] = createSignal<TicketInfo | null>(null);
  const [detailTicket, setDetailTicket] = createSignal<TicketInfo | null>(null);
  const [reviewTicket, setReviewTicket] = createSignal<TicketInfo | null>(null);
  const [syncing, setSyncing] = createSignal(false);
  const [syncSuccess, setSyncSuccess] = createSignal(false);
  const [syncError, setSyncError] = createSignal<ErrorInfo | null>(null);
  const [conflictDialogOpen, setConflictDialogOpen] = createSignal(false);
  const [conflictDetected, setConflictDetected] = createSignal(false);
  const runSyncTickets = useAction(syncTickets);
  let syncInProgress = false;
  async function handleSync() {
    if (syncInProgress) return;
    const d = deps.data();
    if (!d || d.status !== "loaded") return;
    syncInProgress = true;
    // Paint the imperative sync lock before starting filesystem and network work.
    flush(() => {
      setSyncing(true);
      setSyncError(null);
    });
    let showSuccess = false;
    try {
      const ss = await getSyncStatus(deps.projectSlug());
      if (ss.hasConflict) {
        setConflictDetected(true);
        await revalidate(projectSyncRevalidateKeys);
        setConflictDialogOpen(true);
        return;
      }
      setConflictDetected(false);
      if (!ss.hasRemote) {
        setSyncError({
          title: "Sync failed",
          description: "No remote tracking branch configured."
            + " Push the ticket branch to a remote first.",
        });
        return;
      }
      const result = await runSyncTickets(deps.projectSlug());
      if (!result.ok) {
        setSyncError({ title: "Sync failed", description: result.message });
      } else {
        const parsed = parseSyncResult(result);
        if (parsed.type === "success") {
          showSuccess = true;
          setSyncSuccess(true);
          setTimeout(() => {
            setSyncSuccess(false);
            setSyncing(false);
            syncInProgress = false;
          }, 2000);
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
      if (!showSuccess) {
        setSyncing(false);
        syncInProgress = false;
      }
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
    setConflictDetected(false);
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

  function openReview(ticket: TicketInfo) {
    if (!ticket.hasAgentWorktree) return;
    if (detailTicket()) setDetailTicket(null);
    setReviewTicket(ticket);
    // Opening Diff Review replaces the board that owns this event handler.
    // Commit the selection before that dynamic subtree is disposed.
    flush();
  }

  async function handleCreateTicket(number: string, title: string) {
    const result = await createTicket(deps.projectSlug(), number, title);
    if (result.ok) revalidate(ticketMutationRevalidateKeys);
    return result.ok ? {} : { error: result.message };
  }

  async function handleArchiveTicket(folderName: string) {
    const result = await archiveTicket(deps.projectSlug(), folderName);
    if (result.ok) revalidate(ticketMutationRevalidateKeys);
    return result.ok ? {} : { error: result.message };
  }

  async function handleDeleteTicket(folderName: string) {
    const result = await deleteTicket(deps.projectSlug(), folderName);
    if (result.ok) revalidate(ticketMutationRevalidateKeys);
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
    if (result.ok) revalidate(ticketMutationRevalidateKeys);
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
    conflictDetected: conflictDetected(),
  });

  const selectionState = () => {
    return {
      selectedTicket: selectedTicket(),
      detailTicket: detailTicket(),
      reviewTicket: reviewTicket(),
    };
  };

  const commands = {
    openCreate: () => setCreateTicketOpen(true),
    openDelete,
    openArchive,
    openDetail,
    openReview,
    // Callers navigate immediately after these commands and need overlays disposed first.
    closeReview: () => flush(() => setReviewTicket(null)),
    closeDetail: () => flush(() => setDetailTicket(null)),
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
