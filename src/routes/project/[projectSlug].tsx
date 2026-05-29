import { useParams, useNavigate, createAsync, revalidate } from "@solidjs/router";
import { createSignal, Show, For, Switch, Match } from "solid-js";
import { DialogRoot, DialogTitle } from "~/components/ui/dialog";
import { MenuRoot, MenuTrigger, MenuContent, MenuItem, MenuSeparator } from "~/components/ui/menu";
import type { TicketInfo } from "~/server/ticket/ticket-store.js";
import KanbanBoard from "~/components/board/KanbanBoard";
import CreateTicketDialog from "~/components/ticket/CreateTicketDialog";
import EditTicketDialog from "~/components/ticket/EditTicketDialog";
import DeleteTicketDialog from "~/components/ticket/DeleteTicketDialog";
import ArchiveTicketDialog from "~/components/ticket/ArchiveTicketDialog";
import WorktreeCleanupDialog from "~/components/shared/WorktreeCleanupDialog";
import TicketDetailDialog from "~/components/ticket/TicketDetailDialog";
import ConflictDialog from "~/components/shared/ConflictDialog";
import ErrorDialog from "~/components/shared/ErrorDialog";
import type { ErrorInfo } from "~/server/shared/errors.js";
import AddProjectForm from "~/components/project/AddProjectForm";
import ThemeToggle from "~/components/shared/ThemeToggle";
import LauncherSettings from "~/components/launcher/LauncherSettings";
import { useModEnterSubmit, modEnterHint } from "~/lib/use-mod-enter-submit";
import {
  loadBoard, addProjectAction, createTicketAction, updateTicketAction,
  deleteTicketAction, archiveTicketAction, worktreeCleanupAction,
} from "~/server/actions";

export const route = {
  load: ({ params }: { params: { projectSlug: string } }) => loadBoard(params.projectSlug),
};

export default function ProjectPage() {
  const params = useParams();
  const navigate = useNavigate();
  const projectSlug = () => params.projectSlug ?? "";
  const data = createAsync(() => loadBoard(projectSlug()));

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
    const d = data();
    if (!d || d.status !== 'loaded') return;
    if (!d.hasRemote) {
      setSyncError({
        description: "No remote tracking branch configured. Push the ticket branch to a remote first.",
      });
      return;
    }
    setSyncing(true); setSyncError(null);
    try {
      const res = await fetch(`/api/projects/${projectSlug()}/board/sync`, { method: "POST" });
      const result = await res.json();
      if (result.status === "success") {
        setSyncSuccess(true);
        setTimeout(() => setSyncSuccess(false), 2000);
        await revalidate("board-data");
      } else if (result.status === "conflict") {
        setConflictDialogOpen(true);
      } else if (result.status === "error") {
        setSyncError({ description: result.message || "Sync failed" });
      }
    } catch (err) {
      setSyncError({ description: err instanceof Error ? err.message : "Sync failed" });
    }
    finally { setSyncing(false); }
  }

  async function handleConflictResolve(profileName: string) {
    const res = await fetch(`/api/projects/${projectSlug()}/board/resolve-conflicts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileName }),
    });
    if (!res.ok) {
      const body = await res.json();
      throw new Error(body.error || "Failed to launch resolver");
    }
    await revalidate("board-data");
  }

  async function handleConflictAbort() {
    const res = await fetch(`/api/projects/${projectSlug()}/board/sync`, { method: "DELETE" });
    if (!res.ok) { const body = await res.json(); throw new Error(body.error || "Failed to abort rebase"); }
    await revalidate("board-data");
  }

  function handleEdit(ticket: TicketInfo) {
    setSelectedTicket(ticket);
    setEditTicketOpen(true);
  }
  function handleDelete(ticket: TicketInfo) {
    setSelectedTicket(ticket);
    if (ticket.useWorktree) {
      setCleanupAction("delete");
      setCleanupDialogOpen(true);
    } else setDeleteTicketOpen(true);
  }
  function handleArchive(ticket: TicketInfo) {
    setSelectedTicket(ticket);
    if (ticket.useWorktree) {
      setCleanupAction("archive");
      setCleanupDialogOpen(true);
    } else setArchiveTicketOpen(true);
  }

  async function handleViewDetail(ticket: TicketInfo) {
    await revalidate("board-data");
    const d = data();
    const board = d?.status === 'loaded' ? d.board : undefined;
    const fresh = board?.tickets.find((t: TicketInfo) => t.folderName === ticket.folderName);
    setDetailTicket(fresh ?? ticket);
  }

  async function handleReorder(
    folderName: string, fromColumn: string, toColumn: string, newIndex: number,
  ) {
    const res = await fetch(`/api/projects/${projectSlug()}/board/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderName, fromColumn, toColumn, newIndex }),
    });
    if (res.ok) await revalidate("board-data");
  }

  async function handleCreateTicket(number: string, title: string) {
    const result = await createTicketAction(projectSlug(), number, title);
    if (!result.error) revalidate("board-data");
    return result;
  }
  async function handleEditTicket(folderName: string, number: string, title: string) {
    const result = await updateTicketAction(projectSlug(), folderName, number, title, null);
    if (!result.error) revalidate("board-data");
    return result;
  }
  async function handleArchiveTicket(folderName: string) {
    const result = await archiveTicketAction(projectSlug(), folderName);
    if (!result.error) revalidate("board-data");
    return result;
  }
  async function handleDeleteTicket(folderName: string) {
    const result = await deleteTicketAction(projectSlug(), folderName);
    if (!result.error) revalidate("board-data");
    return result;
  }

  async function handleCleanupSubmit(
    folderName: string,
    options: { deleteWorktree: boolean; deleteLocalBranch: boolean; deleteRemoteBranch: boolean },
  ) {
    if (options.deleteWorktree || options.deleteLocalBranch || options.deleteRemoteBranch) {
      const cleanupResult = await worktreeCleanupAction(projectSlug(), folderName, options);
      if (cleanupResult.error) return cleanupResult;
    }
    const action = cleanupAction();
    const result = action === "archive"
      ? await archiveTicketAction(projectSlug(), folderName)
      : await deleteTicketAction(projectSlug(), folderName);
    if (!result.error) revalidate("board-data");
    return result;
  }

  let addProjectDialogRef: HTMLDivElement | undefined;
  useModEnterSubmit({
    onSubmit: () => { addProjectDialogRef?.querySelector("form")?.requestSubmit(); },
    disabled: () => false,
    active: () => addProjectDialogOpen(),
  });

  return (
    <Show when={data()} fallback={<p>Loading...</p>}>
      {(d) => {
        const ld = () => { const v = d(); return v.status === 'loaded' ? v : undefined; };
        const unavail = () => { const v = d(); return v.status === 'unavailable' ? v : undefined; };
        const pageErr = () => { const v = d(); return v.status === 'error' ? v : undefined; };
        return (
        <div class="flex min-h-screen flex-col">
          <header class="flex items-center justify-between border-b border-border px-4 py-3">
            <h1 class="text-xl font-semibold">Context & Launch</h1>
            <div class="flex items-center gap-2">
              <ThemeToggle />
              <button
                onClick={ld()?.hasConflict ? () => setConflictDialogOpen(true) : handleSync}
                disabled={syncing()}
                class={`btn-icon relative ${
                  ld()?.hasConflict ? "border-destructive text-destructive hover:bg-destructive/10" : ""
                }`}
                title={ld()?.hasConflict ? "Resolve conflicts" : "Sync tickets"}
                data-testid="sync-button"
              >
                <Show when={syncSuccess()} fallback={
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round"
                  >
                    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                    <path d="M3 3v5h5"/>
                    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
                    <path d="M16 16h5v5"/>
                  </svg>
                }>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round" data-testid="sync-check"
                  >
                    <path d="M20 6 9 17l-5-5"/>
                  </svg>
                </Show>
                <Show when={ld()?.hasConflict}>
                  <span
                    class={
                      "absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center"
                      + " rounded-full bg-destructive text-[8px] font-bold leading-none"
                      + " text-destructive-foreground"
                    }
                    data-testid="sync-conflict-badge"
                  >!</span>
                </Show>
              </button>
              <button onClick={() => setSettingsOpen(true)} class="btn-icon" title="Settings">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round"
                >
                  {/* eslint-disable-next-line max-len */}
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
              <MenuRoot
                trigger={
                  <MenuTrigger class="ripple btn-secondary">
                    {d().projectSlug}
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                      stroke-linecap="round" stroke-linejoin="round" class="ml-2"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </MenuTrigger>
                }
              >
                <MenuContent class="min-w-[200px]">
                  <For each={d().projects}>
                    {(project) => (
                      <MenuItem
                        value={`project-${project.projectSlug}`}
                        disabled={!project.available}
                        class={project.projectSlug === d().projectSlug ? "font-semibold" : ""}
                        onClick={() => navigate(`/project/${project.projectSlug}`)}
                      >
                        {project.projectSlug}
                      </MenuItem>
                    )}
                  </For>
                  <MenuSeparator />
                  <MenuItem value="add-project" onClick={() => setAddProjectDialogOpen(true)}>Add project...</MenuItem>
                </MenuContent>
              </MenuRoot>
              <button class="btn-primary" onClick={() => setCreateTicketOpen(true)}>+ New Ticket</button>
            </div>
          </header>

          <main class="flex-1">
            <Switch>
              <Match when={d().status === 'not-found'}>
                <div class="flex h-64 items-center justify-center">
                  <p class="text-muted-foreground">Project not found</p>
                </div>
              </Match>
              <Match when={unavail()}>
                {(u) => (
                  <div class="flex h-64 flex-col items-center justify-center gap-2">
                    <p class="text-lg font-medium">Project unavailable</p>
                    <p class="text-sm text-muted-foreground">{u().projectPath}</p>
                  </div>
                )}
              </Match>
              <Match when={pageErr()}>
                {(e) => (
                  <div class="flex h-64 flex-col items-center justify-center gap-2">
                    <p class="text-destructive">{e().error}</p>
                    <button class="btn-secondary" onClick={() => revalidate("board-data")}>Retry</button>
                  </div>
                )}
              </Match>
              <Match when={ld()}>
                {(loaded) => (
                  <KanbanBoard
                    board={loaded().board}
                    projectSlug={d().projectSlug}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onArchive={handleArchive}
                    onViewDetail={handleViewDetail}
                    onReorder={handleReorder}
                  />
                )}
              </Match>
            </Switch>
          </main>

          <CreateTicketDialog
            open={createTicketOpen()}
            onOpenChange={setCreateTicketOpen}
            onSubmit={handleCreateTicket}
            suggestedNextNumber={ld()?.suggestedNextNumber ?? null}
          />
          <EditTicketDialog
            open={editTicketOpen()}
            onOpenChange={setEditTicketOpen}
            ticket={selectedTicket()}
            onSubmit={handleEditTicket}
          />
          <DeleteTicketDialog
            open={deleteTicketOpen()}
            onOpenChange={setDeleteTicketOpen}
            ticket={selectedTicket()}
            onSubmit={handleDeleteTicket}
          />
          <ArchiveTicketDialog
            open={archiveTicketOpen()}
            onOpenChange={setArchiveTicketOpen}
            ticket={selectedTicket()}
            onSubmit={handleArchiveTicket}
          />
          <WorktreeCleanupDialog
            open={cleanupDialogOpen()}
            onOpenChange={setCleanupDialogOpen}
            ticket={selectedTicket()}
            action={cleanupAction()}
            onSubmit={handleCleanupSubmit}
          />
          <TicketDetailDialog
            onClose={() => setDetailTicket(null)}
            projectSlug={d().projectSlug}
            ticket={detailTicket()}
          />

          <DialogRoot
            open={addProjectDialogOpen()}
            onOpenChange={() => setAddProjectDialogOpen(false)}
            ref={addProjectDialogRef}
          >
            <DialogTitle>Add Project</DialogTitle>
            <AddProjectForm
              action={addProjectAction}
              onSuccess={(s) => {
                setAddProjectDialogOpen(false);
                navigate(`/project/${s}`);
              }}
              submitTitle={modEnterHint()}
            />
          </DialogRoot>

          <ConflictDialog
            open={conflictDialogOpen()}
            onOpenChange={setConflictDialogOpen}
            onResolve={handleConflictResolve}
            onAbort={handleConflictAbort}
            projectSlug={d().projectSlug}
          />
          <ErrorDialog error={syncError()} onClose={() => setSyncError(null)} />
          <LauncherSettings
            open={settingsOpen()}
            onOpenChange={(open) => {
              setSettingsOpen(open);
              if (!open) revalidate("board-data");
            }}
            projectSlug={d().projectSlug}
          />
        </div>
        );
      }}
    </Show>
  );
}
