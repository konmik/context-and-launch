import { useParams, useNavigate, createAsync, revalidate } from "@solidjs/router";
import { Show, For, Switch, Match } from "solid-js";
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
import AddProjectForm from "~/components/project/AddProjectForm";
import ThemeToggle from "~/components/shared/ThemeToggle";
import LauncherSettings from "~/components/launcher/LauncherSettings";
import { useModEnterSubmit, modEnterHint } from "~/lib/use-mod-enter-submit";
import { loadBoard } from "~/server/actions";
import { addProjectAction } from "~/lib/add-project";
import {
  createProjectPageController,
  type ProjectPageController,
} from "~/components/project/project-page-controller.js";

export const route = {
  load: ({ params }: { params: { projectSlug: string } }) => loadBoard(params.projectSlug),
};

export default function ProjectPage(props?: { ctrl?: ProjectPageController }) {
  const params = useParams();
  const navigate = useNavigate();
  const projectSlug = () => params.projectSlug ?? "";
  const data = createAsync(() => loadBoard(projectSlug()));

  const { dialogState, syncState, selectionState, commands } =
    props?.ctrl ?? createProjectPageController({ projectSlug, data: data as any });

  let addProjectDialogRef: HTMLDivElement | undefined;
  useModEnterSubmit({
    onSubmit: () => { addProjectDialogRef?.querySelector("form")?.requestSubmit(); },
    disabled: () => false,
    active: () => dialogState().addProjectDialogOpen,
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
                onClick={ld()?.hasConflict ? () => commands.setConflictDialogOpen(true) : commands.handleSync}
                disabled={syncState().syncing}
                class={`btn-icon relative ${
                  ld()?.hasConflict ? "border-destructive text-destructive hover:bg-destructive/10" : ""
                }`}
                title={ld()?.hasConflict ? "Resolve conflicts" : "Sync tickets"}
                data-testid="sync-button-trigger"
              >
                <Show when={syncState().syncSuccess} fallback={
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
                    stroke-linecap="round" stroke-linejoin="round" data-testid="sync-button-check-icon"
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
                    data-testid="sync-button-conflict-badge"
                  >!</span>
                </Show>
              </button>
              <button
                onClick={commands.openSettings}
                class="btn-icon"
                title="Settings"
                data-testid="project-header-settings-button"
              >
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
                  <MenuTrigger class="ripple btn-secondary" data-testid="project-header-project-dropdown-trigger">
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
                        data-testid="project-header-project-item"
                      >
                        {project.projectSlug}
                      </MenuItem>
                    )}
                  </For>
                  <MenuSeparator />
                  <MenuItem
                    value="add-project"
                    onClick={commands.openAddProject}
                    data-testid="project-header-add-project-menuitem"
                  >Add project...</MenuItem>
                </MenuContent>
              </MenuRoot>
              <button
                class="btn-primary"
                onClick={commands.openCreate}
                data-testid="project-header-new-ticket-button"
              >+ New Ticket</button>
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
                    onEdit={commands.openEdit}
                    onDelete={commands.openDelete}
                    onArchive={commands.openArchive}
                    onViewDetail={commands.openDetail}
                    onReorder={commands.handleReorder}
                  />
                )}
              </Match>
            </Switch>
          </main>

          <CreateTicketDialog
            open={dialogState().createTicketOpen}
            onOpenChange={commands.setCreateTicketOpen}
            onSubmit={commands.handleCreateTicket}
            suggestedNextNumber={ld()?.suggestedNextNumber ?? null}
          />
          <EditTicketDialog
            open={dialogState().editTicketOpen}
            onOpenChange={commands.setEditTicketOpen}
            ticket={selectionState().selectedTicket}
            onSubmit={commands.handleEditTicket}
          />
          <DeleteTicketDialog
            open={dialogState().deleteTicketOpen}
            onOpenChange={commands.setDeleteTicketOpen}
            ticket={selectionState().selectedTicket}
            onSubmit={commands.handleDeleteTicket}
          />
          <ArchiveTicketDialog
            open={dialogState().archiveTicketOpen}
            onOpenChange={commands.setArchiveTicketOpen}
            ticket={selectionState().selectedTicket}
            onSubmit={commands.handleArchiveTicket}
          />
          <WorktreeCleanupDialog
            open={dialogState().cleanupDialogOpen}
            onOpenChange={commands.setCleanupDialogOpen}
            ticket={selectionState().selectedTicket}
            action={dialogState().cleanupAction}
            onSubmit={commands.handleCleanupSubmit}
          />
          <TicketDetailDialog
            onClose={commands.closeDetail}
            projectSlug={d().projectSlug}
            ticket={selectionState().detailTicket}
          />

          <DialogRoot
            open={dialogState().addProjectDialogOpen}
            onOpenChange={commands.closeAddProject}
            ref={addProjectDialogRef}
          >
            <DialogTitle>Add Project</DialogTitle>
            <AddProjectForm
              action={addProjectAction}
              onSuccess={(s) => {
                commands.closeAddProject();
                navigate(`/project/${s}`);
              }}
              submitTitle={modEnterHint()}
            />
          </DialogRoot>

          <ConflictDialog
            open={dialogState().conflictDialogOpen}
            onOpenChange={commands.setConflictDialogOpen}
            onResolve={commands.handleConflictResolve}
            onAbort={commands.handleConflictAbort}
            projectSlug={d().projectSlug}
          />
          <ErrorDialog error={syncState().syncError} onClose={() => commands.setSyncError(null)} />
          <LauncherSettings
            open={dialogState().settingsOpen}
            onOpenChange={(open) => {
              if (open) commands.openSettings();
              else {
                commands.closeSettings();
                revalidate("board-data");
              }
            }}
            projectSlug={d().projectSlug}
          />
        </div>
        );
      }}
    </Show>
  );
}
