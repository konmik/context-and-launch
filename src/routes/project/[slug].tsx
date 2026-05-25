import { useParams, useNavigate, createAsync, revalidate } from "@solidjs/router";
import { createSignal, Show, For } from "solid-js";
import type { TicketInfo } from "~/types.js";
import KanbanBoard from "~/components/KanbanBoard";
import CreateTicketDialog from "~/components/CreateTicketDialog";
import EditTicketDialog from "~/components/EditTicketDialog";
import DeleteTicketDialog from "~/components/DeleteTicketDialog";
import ArchiveTicketDialog from "~/components/ArchiveTicketDialog";
import WorktreeCleanupDialog from "~/components/WorktreeCleanupDialog";
import TicketDetailDialog from "~/components/TicketDetailDialog";
import AddProjectForm from "~/components/AddProjectForm";
import ThemeToggle from "~/components/ThemeToggle";
import LauncherSettings from "~/components/LauncherSettings";
import { useModEnterSubmit, modEnterHint } from "~/lib/use-mod-enter-submit";
import {
  loadBoard,
  addProjectAction,
  createTicketAction,
  updateTicketAction,
  deleteTicketAction,
  archiveTicketAction,
  worktreeCleanupAction,
} from "~/server/actions";

export const route = {
  load: ({ params }: { params: { slug: string } }) => loadBoard(params.slug),
};

export default function ProjectPage() {
  const params = useParams();
  const navigate = useNavigate();
  const slug = () => params.slug ?? "";
  const data = createAsync(() => loadBoard(slug()));

  const [dropdownOpen, setDropdownOpen] = createSignal(false);
  const [addProjectDialogOpen, setAddProjectDialogOpen] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [createTicketOpen, setCreateTicketOpen] = createSignal(false);
  const [editTicketOpen, setEditTicketOpen] = createSignal(false);
  const [deleteTicketOpen, setDeleteTicketOpen] = createSignal(false);
  const [archiveTicketOpen, setArchiveTicketOpen] = createSignal(false);
  const [cleanupDialogOpen, setCleanupDialogOpen] = createSignal(false);
  const [cleanupAction, setCleanupAction] = createSignal<"archive" | "delete">("archive");
  const [detailTicketOpen, setDetailTicketOpen] = createSignal(false);
  const [selectedTicket, setSelectedTicket] = createSignal<TicketInfo | null>(
    null
  );

  function handleEdit(ticket: TicketInfo) {
    setSelectedTicket(ticket);
    setEditTicketOpen(true);
  }

  function handleDelete(ticket: TicketInfo) {
    setSelectedTicket(ticket);
    if (ticket.useWorktree) {
      setCleanupAction("delete");
      setCleanupDialogOpen(true);
    } else {
      setDeleteTicketOpen(true);
    }
  }

  function handleArchive(ticket: TicketInfo) {
    setSelectedTicket(ticket);
    if (ticket.useWorktree) {
      setCleanupAction("archive");
      setCleanupDialogOpen(true);
    } else {
      setArchiveTicketOpen(true);
    }
  }

  async function handleViewDetail(ticket: TicketInfo) {
    await revalidate("board-data");
    const fresh = data()?.board?.tickets.find((t: TicketInfo) => t.folderName === ticket.folderName);
    setSelectedTicket(fresh ?? ticket);
    setDetailTicketOpen(true);
  }

  async function handleReorder(folderName: string, fromColumn: string, toColumn: string, newIndex: number) {
    const res = await fetch(`/api/projects/${slug()}/board/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderName, fromColumn, toColumn, newIndex }),
    });
    if (res.ok) {
      await revalidate("board-data");
    }
  }

  async function handleCreateTicket(number: string, title: string) {
    const result = await createTicketAction(slug(), number, title);
    if (!result.error) {
      revalidate("board-data");
    }
    return result;
  }

  async function handleEditTicket(
    folderName: string,
    number: string,
    title: string
  ) {
    const result = await updateTicketAction(
      slug(),
      folderName,
      number,
      title,
      null
    );
    if (!result.error) {
      revalidate("board-data");
    }
    return result;
  }

  async function handleArchiveTicket(folderName: string) {
    const result = await archiveTicketAction(slug(), folderName);
    if (!result.error) {
      revalidate("board-data");
    }
    return result;
  }

  async function handleDeleteTicket(folderName: string) {
    const result = await deleteTicketAction(slug(), folderName);
    if (!result.error) {
      revalidate("board-data");
    }
    return result;
  }

  async function handleCleanupSubmit(
    folderName: string,
    options: { deleteWorktree: boolean; deleteLocalBranch: boolean; deleteRemoteBranch: boolean }
  ) {
    const anyCleanup = options.deleteWorktree || options.deleteLocalBranch || options.deleteRemoteBranch;
    if (anyCleanup) {
      const cleanupResult = await worktreeCleanupAction(slug(), folderName, options);
      if (cleanupResult.error) return cleanupResult;
    }

    const action = cleanupAction();
    if (action === "archive") {
      const result = await archiveTicketAction(slug(), folderName);
      if (!result.error) revalidate("board-data");
      return result;
    } else {
      const result = await deleteTicketAction(slug(), folderName);
      if (!result.error) revalidate("board-data");
      return result;
    }
  }

  let addProjectDialogRef: HTMLDivElement | undefined;

  useModEnterSubmit({
    onSubmit: () => {
      const form = addProjectDialogRef?.querySelector("form");
      if (form) form.requestSubmit();
    },
    disabled: () => false,
    active: () => addProjectDialogOpen(),
  });

  function handleAddProjectSuccess(slug: string) {
    setAddProjectDialogOpen(false);
    navigate(`/project/${slug}`);
  }

  return (
    <Show when={data()} fallback={<p>Loading...</p>}>
      {(d) => (
        <div class="flex min-h-screen flex-col">
          <header class="flex items-center justify-between border-b border-border px-4 py-3">
            <h1 class="text-xl font-semibold">AI Stages</h1>

            <div class="flex items-center gap-2">
              <ThemeToggle />
              <button
                onClick={() => setSettingsOpen(true)}
                class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                title="Launcher Settings"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
              <div class="relative">
                <button
                  class="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 py-1 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                  onClick={() => setDropdownOpen(!dropdownOpen())}
                >
                  {d().slug}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="ml-2"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                <Show when={dropdownOpen()}>
                  <div
                    class="fixed inset-0 z-40"
                    onClick={() => setDropdownOpen(false)}
                  />
                  <div class="absolute right-0 z-50 mt-1 min-w-[200px] rounded-md border border-border bg-popover py-1 shadow-md">
                    <For each={d().projects}>
                      {(project) => (
                        <Show
                          when={project.available}
                          fallback={
                            <span class="block w-full px-3 py-2 text-sm text-muted-foreground opacity-50">
                              {project.slug}
                            </span>
                          }
                        >
                          <button
                            class={`w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground ${
                              project.slug === d().slug ? "font-semibold" : ""
                            }`}
                            onClick={() => {
                              setDropdownOpen(false);
                              navigate(`/project/${project.slug}`);
                            }}
                          >
                            {project.slug}
                          </button>
                        </Show>
                      )}
                    </For>
                    <div class="my-1 border-t border-border" />
                    <button
                      class="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                      onClick={() => {
                        setDropdownOpen(false);
                        setAddProjectDialogOpen(true);
                      }}
                    >
                      Add project...
                    </button>
                  </div>
                </Show>
              </div>

              <button
                class="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 py-1 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                onClick={() => setCreateTicketOpen(true)}
              >
                + New Ticket
              </button>
            </div>
          </header>

          <main class="flex-1">
            <Show when={d().projectNotFound}>
              <div class="flex h-64 items-center justify-center">
                <p class="text-muted-foreground">Project not found</p>
              </div>
            </Show>
            <Show when={d().projectUnavailable}>
              <div class="flex h-64 flex-col items-center justify-center gap-2">
                <p class="text-lg font-medium">Project unavailable</p>
                <p class="text-sm text-muted-foreground">{d().projectPath}</p>
              </div>
            </Show>
            <Show when={d().error}>
              <div class="flex h-64 flex-col items-center justify-center gap-2">
                <p class="text-destructive">{d().error}</p>
                <button
                  class="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 py-1 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                  onClick={() => revalidate("board-data")}
                >
                  Retry
                </button>
              </div>
            </Show>
            <Show when={d().board}>
              {(board) => (
                <KanbanBoard
                  board={board()}
                  slug={d().slug}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onArchive={handleArchive}
                  onViewDetail={handleViewDetail}
                  onReorder={handleReorder}
                />
              )}
            </Show>
          </main>

          <CreateTicketDialog
            open={createTicketOpen()}
            onOpenChange={setCreateTicketOpen}
            onSubmit={handleCreateTicket}
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
            open={detailTicketOpen()}
            onOpenChange={setDetailTicketOpen}
            slug={d().slug}
            ticket={selectedTicket()}
          />

          <Show when={addProjectDialogOpen()}>
            <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div
                class="fixed inset-0"
                onClick={() => setAddProjectDialogOpen(false)}
              />
              <div ref={addProjectDialogRef} class="relative z-10 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
                <h2 class="mb-4 text-lg font-semibold">Add Project</h2>
                <AddProjectForm
                  action={addProjectAction}
                  onSuccess={handleAddProjectSuccess}
                  submitTitle={modEnterHint()}
                />
              </div>
            </div>
          </Show>

          <LauncherSettings
            open={settingsOpen()}
            onOpenChange={setSettingsOpen}
            slug={d().slug}
          />
        </div>
      )}
    </Show>
  );
}
