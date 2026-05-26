import { useParams, useNavigate, createAsync, revalidate } from "@solidjs/router";
import { createSignal, Show, For } from "solid-js";
import { Dialog } from "~/components/ui/dialog";
import { Menu } from "~/components/ui/menu";
import type { TicketInfo } from "~/types.js";
import KanbanBoard from "~/components/KanbanBoard";
import CreateTicketDialog from "~/components/CreateTicketDialog";
import EditTicketDialog from "~/components/EditTicketDialog";
import DeleteTicketDialog from "~/components/DeleteTicketDialog";
import ArchiveTicketDialog from "~/components/ArchiveTicketDialog";
import WorktreeCleanupDialog from "~/components/WorktreeCleanupDialog";
import TicketDetailDialog from "~/components/TicketDetailDialog";
import ConflictDialog from "~/components/ConflictDialog";
import ErrorDialog from "~/components/ErrorDialog";
import type { ErrorInfo } from "~/types.js";
import AddProjectForm from "~/components/AddProjectForm";
import ThemeToggle from "~/components/ThemeToggle";
import LauncherSettings from "~/components/LauncherSettings";
import { useModEnterSubmit, modEnterHint } from "~/lib/use-mod-enter-submit";
import {
  loadBoard, addProjectAction, createTicketAction, updateTicketAction,
  deleteTicketAction, archiveTicketAction, worktreeCleanupAction,
} from "~/server/actions";

export const route = {
  load: ({ params }: { params: { slug: string } }) => loadBoard(params.slug),
};

export default function ProjectPage() {
  const params = useParams();
  const navigate = useNavigate();
  const slug = () => params.slug ?? "";
  const data = createAsync(() => loadBoard(slug()));

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
    if (!data()?.hasRemote) { setSyncError({ description: "No remote tracking branch configured. Push the ticket branch to a remote first." }); return; }
    setSyncing(true); setSyncError(null);
    try {
      const res = await fetch(`/api/projects/${slug()}/board/sync`, { method: "POST" });
      const result = await res.json();
      if (result.status === "success") { setSyncSuccess(true); setTimeout(() => setSyncSuccess(false), 2000); await revalidate("board-data"); }
      else if (result.status === "conflict") setConflictDialogOpen(true);
      else if (result.status === "error") setSyncError({ description: result.message || "Sync failed" });
    } catch (err) { setSyncError({ description: err instanceof Error ? err.message : "Sync failed" }); }
    finally { setSyncing(false); }
  }

  async function handleConflictResolve(profileName: string) {
    const res = await fetch(`/api/projects/${slug()}/board/resolve-conflicts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileName }) });
    if (!res.ok) { const body = await res.json(); throw new Error(body.error || "Failed to launch resolver"); }
    await revalidate("board-data");
  }

  async function handleConflictAbort() {
    const res = await fetch(`/api/projects/${slug()}/board/sync`, { method: "DELETE" });
    if (!res.ok) { const body = await res.json(); throw new Error(body.error || "Failed to abort rebase"); }
    await revalidate("board-data");
  }

  function handleEdit(ticket: TicketInfo) { setSelectedTicket(ticket); setEditTicketOpen(true); }
  function handleDelete(ticket: TicketInfo) { setSelectedTicket(ticket); if (ticket.useWorktree) { setCleanupAction("delete"); setCleanupDialogOpen(true); } else setDeleteTicketOpen(true); }
  function handleArchive(ticket: TicketInfo) { setSelectedTicket(ticket); if (ticket.useWorktree) { setCleanupAction("archive"); setCleanupDialogOpen(true); } else setArchiveTicketOpen(true); }

  async function handleViewDetail(ticket: TicketInfo) {
    await revalidate("board-data");
    const fresh = data()?.board?.tickets.find((t: TicketInfo) => t.folderName === ticket.folderName);
    setDetailTicket(fresh ?? ticket);
  }

  async function handleReorder(folderName: string, fromColumn: string, toColumn: string, newIndex: number) {
    const res = await fetch(`/api/projects/${slug()}/board/reorder`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folderName, fromColumn, toColumn, newIndex }) });
    if (res.ok) await revalidate("board-data");
  }

  async function handleCreateTicket(number: string, title: string) { const result = await createTicketAction(slug(), number, title); if (!result.error) revalidate("board-data"); return result; }
  async function handleEditTicket(folderName: string, number: string, title: string) { const result = await updateTicketAction(slug(), folderName, number, title, null); if (!result.error) revalidate("board-data"); return result; }
  async function handleArchiveTicket(folderName: string) { const result = await archiveTicketAction(slug(), folderName); if (!result.error) revalidate("board-data"); return result; }
  async function handleDeleteTicket(folderName: string) { const result = await deleteTicketAction(slug(), folderName); if (!result.error) revalidate("board-data"); return result; }

  async function handleCleanupSubmit(folderName: string, options: { deleteWorktree: boolean; deleteLocalBranch: boolean; deleteRemoteBranch: boolean }) {
    if (options.deleteWorktree || options.deleteLocalBranch || options.deleteRemoteBranch) {
      const cleanupResult = await worktreeCleanupAction(slug(), folderName, options);
      if (cleanupResult.error) return cleanupResult;
    }
    const action = cleanupAction();
    const result = action === "archive" ? await archiveTicketAction(slug(), folderName) : await deleteTicketAction(slug(), folderName);
    if (!result.error) revalidate("board-data");
    return result;
  }

  let addProjectDialogRef: HTMLDivElement | undefined;
  useModEnterSubmit({ onSubmit: () => { addProjectDialogRef?.querySelector("form")?.requestSubmit(); }, disabled: () => false, active: () => addProjectDialogOpen() });

  return (
    <Show when={data()} fallback={<p>Loading...</p>}>
      {(d) => (
        <div class="flex min-h-screen flex-col">
          <header class="flex items-center justify-between border-b border-border px-4 py-3">
            <h1 class="text-xl font-semibold">AI Stages</h1>
            <div class="flex items-center gap-2">
              <ThemeToggle />
              <button
                onClick={d().hasConflict ? () => setConflictDialogOpen(true) : handleSync}
                disabled={syncing()}
                class={`btn-icon relative ${d().hasConflict ? "border-destructive text-destructive hover:bg-destructive/10" : ""}`}
                title={d().hasConflict ? "Resolve conflicts" : "Sync tickets"}
                data-testid="sync-button"
              >
                <Show when={syncSuccess()} fallback={
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
                }>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-testid="sync-check"><path d="M20 6 9 17l-5-5"/></svg>
                </Show>
                <Show when={d().hasConflict}>
                  <span class="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-[8px] font-bold leading-none text-destructive-foreground" data-testid="sync-conflict-badge">!</span>
                </Show>
              </button>
              <button onClick={() => setSettingsOpen(true)} class="btn-icon" title="Settings">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
              <Menu
                trigger={
                  <Menu.Trigger class="btn-secondary">
                    {d().slug}
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ml-2"><path d="m6 9 6 6 6-6" /></svg>
                  </Menu.Trigger>
                }
              >
                <Menu.Content class="min-w-[200px]">
                  <For each={d().projects}>
                    {(project) => (
                      <Menu.Item
                        value={`project-${project.slug}`}
                        disabled={!project.available}
                        class={project.slug === d().slug ? "font-semibold" : ""}
                        onClick={() => navigate(`/project/${project.slug}`)}
                      >
                        {project.slug}
                      </Menu.Item>
                    )}
                  </For>
                  <Menu.Separator />
                  <Menu.Item value="add-project" onClick={() => setAddProjectDialogOpen(true)}>Add project...</Menu.Item>
                </Menu.Content>
              </Menu>
              <button class="btn-primary" onClick={() => setCreateTicketOpen(true)}>+ New Ticket</button>
            </div>
          </header>

          <main class="flex-1">
            <Show when={d().projectNotFound}><div class="flex h-64 items-center justify-center"><p class="text-muted-foreground">Project not found</p></div></Show>
            <Show when={d().projectUnavailable}><div class="flex h-64 flex-col items-center justify-center gap-2"><p class="text-lg font-medium">Project unavailable</p><p class="text-sm text-muted-foreground">{d().projectPath}</p></div></Show>
            <Show when={d().error}><div class="flex h-64 flex-col items-center justify-center gap-2"><p class="text-destructive">{d().error}</p><button class="btn-secondary" onClick={() => revalidate("board-data")}>Retry</button></div></Show>
            <Show when={d().board}>{(board) => (<KanbanBoard board={board()} slug={d().slug} onEdit={handleEdit} onDelete={handleDelete} onArchive={handleArchive} onViewDetail={handleViewDetail} onReorder={handleReorder} />)}</Show>
          </main>

          <CreateTicketDialog open={createTicketOpen()} onOpenChange={setCreateTicketOpen} onSubmit={handleCreateTicket} suggestedNextNumber={d().suggestedNextNumber} />
          <EditTicketDialog open={editTicketOpen()} onOpenChange={setEditTicketOpen} ticket={selectedTicket()} onSubmit={handleEditTicket} />
          <DeleteTicketDialog open={deleteTicketOpen()} onOpenChange={setDeleteTicketOpen} ticket={selectedTicket()} onSubmit={handleDeleteTicket} />
          <ArchiveTicketDialog open={archiveTicketOpen()} onOpenChange={setArchiveTicketOpen} ticket={selectedTicket()} onSubmit={handleArchiveTicket} />
          <WorktreeCleanupDialog open={cleanupDialogOpen()} onOpenChange={setCleanupDialogOpen} ticket={selectedTicket()} action={cleanupAction()} onSubmit={handleCleanupSubmit} />
          <TicketDetailDialog onClose={() => setDetailTicket(null)} slug={d().slug} ticket={detailTicket()} />

          <Dialog open={addProjectDialogOpen()} onOpenChange={() => setAddProjectDialogOpen(false)} ref={addProjectDialogRef}>
            <Dialog.Title>Add Project</Dialog.Title>
            <AddProjectForm action={addProjectAction} onSuccess={(s) => { setAddProjectDialogOpen(false); navigate(`/project/${s}`); }} submitTitle={modEnterHint()} />
          </Dialog>

          <ConflictDialog open={conflictDialogOpen()} onOpenChange={setConflictDialogOpen} onResolve={handleConflictResolve} onAbort={handleConflictAbort} slug={d().slug} />
          <ErrorDialog error={syncError()} onClose={() => setSyncError(null)} />
          <LauncherSettings open={settingsOpen()} onOpenChange={setSettingsOpen} slug={d().slug} />
        </div>
      )}
    </Show>
  );
}
