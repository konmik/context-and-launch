import { useParams, useNavigate, createAsync, revalidate } from "@solidjs/router";
import { clientOnly } from "@solidjs/start";
import { Show, For, Switch, Match, createSignal, createEffect, createMemo, onCleanup, onMount } from "solid-js";
import { DialogRoot, DialogTitle } from "~/components/ui/dialog";
import { MenuRoot, MenuTrigger, MenuContent, MenuItem, MenuSeparator } from "~/components/ui/menu";

const KanbanBoard = clientOnly(() => import("~/components/board/KanbanBoard"));
const ForestView = clientOnly(() => import("~/components/forest/ForestView"));
import { getViewMode, setViewMode } from "~/components/forest/forest-local-state.js";
import CreateTicketDialog from "~/components/ticket/CreateTicketDialog";
import EditTicketDialog from "~/components/ticket/EditTicketDialog";
import TicketCleanupDialog from "~/components/shared/TicketCleanupDialog";
import TicketDetailDialog from "~/components/ticket/TicketDetailDialog";
import ConflictDialog from "~/components/shared/ConflictDialog";
import ErrorDialog from "~/components/shared/ErrorDialog";
import AddProjectForm from "~/components/project/AddProjectForm";
import ThemeToggle from "~/components/shared/ThemeToggle";
import LogViewerDialog from "~/components/shared/LogViewerDialog";
import LauncherSettings from "~/components/launcher/LauncherSettings";
import { useModEnterSubmit, modEnterHint } from "~/lib/use-mod-enter-submit";
import { loadProjectPage, addProject, recordProjectFocus } from "~/components/project/project-api.js";
import {
  createProjectPageController,
  type ProjectPageController,
} from "~/components/project/project-page-controller.js";
import { getSyncPending } from "~/components/ticket/ticket-api.js";
import { getHerdrAgentStatuses } from "~/components/board/herdr-status-api.js";

export const route = {
  load: ({ params }: { params: { projectSlug: string } }) => loadProjectPage(params.projectSlug),
};

export default function ProjectPage(props?: { ctrl?: ProjectPageController }) {
  const params = useParams();
  const navigate = useNavigate();
  const projectSlug = () => params.projectSlug ?? "";
  const data = createAsync(() => loadProjectPage(projectSlug()));

  // onMount runs only after client hydration, so this attribute marks the point
  // at which event handlers are live and clicks will no longer be dropped.
  const [hydrated, setHydrated] = createSignal(false);
  onMount(() => setHydrated(true));

  const [viewMode, setViewModeSignal] = createSignal<'kanban' | 'forest'>('kanban');
  createEffect(() => {
    const ps = projectSlug();
    if (!ps) return;
    setViewModeSignal(getViewMode(localStorage, ps));
  });
  function toggleViewMode() {
    const ps = projectSlug();
    if (!ps) return;
    const next = viewMode() === 'kanban' ? 'forest' : 'kanban';
    setViewMode(localStorage, ps, next);
    setViewModeSignal(next);
  }

  const { dialogState, syncState, selectionState, commands } =
    props?.ctrl ?? createProjectPageController({ projectSlug, data: data as any });

  const [logViewerOpen, setLogViewerOpen] = createSignal(false);
  const [hasPendingChanges, setHasPendingChanges] = createSignal(false);
  createEffect(() => {
    const ps = projectSlug();
    if (!ps) return;
    setHasPendingChanges(false);
    let stopped = false;
    const poll = async () => {
      try {
        const result = await getSyncPending(ps);
        if (!stopped) setHasPendingChanges(result);
      } catch { /* ignore poll failures */ }
    };
    void poll();
    const timer = setInterval(() => void poll(), 10000);
    onCleanup(() => { stopped = true; clearInterval(timer); });
  });

  const herdrStatusesResult = createAsync(() => getHerdrAgentStatuses(projectSlug()));
  const herdrPollingActive = createMemo(() => {
    const result = herdrStatusesResult();
    return !!result && result.kind !== "disabled";
  });
  createEffect(() => {
    if (!herdrPollingActive()) return;
    const timer = setInterval(() => void revalidate("herdr-agent-statuses"), 5000);
    onCleanup(() => clearInterval(timer));
  });
  const herdrTicketStatuses = () => {
    const result = herdrStatusesResult();
    return result?.kind === "available" ? result.statusesByFolderName : {};
  };

  const conflictActive = createMemo(() => {
    const v = data();
    return v?.status === "loaded" && v.hasConflict;
  });
  createEffect(() => {
    if (!conflictActive()) return;
    const timer = setInterval(() => void revalidate("project-page"), 5000);
    onCleanup(() => clearInterval(timer));
  });

  const currentProjectName = () => {
    const v = data();
    if (!v) return "";
    return v.projects.find((p) => p.projectSlug === v.projectSlug)?.name ?? v.projectSlug;
  };

  let lastReportedProjectSlug: string | null = null;
  createEffect(() => {
    const v = data();
    if (v?.status === "loaded" && v.projectSlug !== lastReportedProjectSlug) {
      lastReportedProjectSlug = v.projectSlug;
      void recordProjectFocus(v.projectSlug);
    }
  });

  onMount(() => {
    const handler = () => {
      const v = data();
      if (v?.status === "loaded") void recordProjectFocus(v.projectSlug);
    };
    window.addEventListener("focus", handler);
    onCleanup(() => window.removeEventListener("focus", handler));
  });

  createEffect(() => {
    const name = currentProjectName();
    if (name) document.title = `${name} - Context & Launch`;
  });

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
        <div class="flex min-h-screen flex-col" data-hydrated={hydrated() ? "true" : undefined}>
          <header class="flex items-center justify-between px-4 py-3">
            <div class="flex flex-1 items-center justify-start">
              <button
                class="btn-primary"
                onClick={commands.openCreate}
                data-testid="project-header-new-ticket-button"
              >+ New Ticket</button>
            </div>
            <h1 class="text-xl font-semibold">{currentProjectName()}</h1>
            <div class="flex flex-1 items-center justify-end gap-2">
              <ThemeToggle />
              <button
                onClick={toggleViewMode}
                class="btn-icon"
                title={viewMode() === 'kanban' ? 'Forest view' : 'Kanban view'}
                data-testid="project-header-forest-toggle-button"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                >
                  <path d="M6 16.5V12h12V7.5M6 12V7.5" />
                  <rect x="3" y="3" width="6" height="5" />
                  <rect x="15" y="3" width="6" height="5" />
                  <rect x="3" y="16" width="6" height="5" />
                </svg>
              </button>
              <button
                onClick={() => setLogViewerOpen(true)}
                class="btn-icon"
                title="Application logs"
                data-testid="project-header-logs-button"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round"
                >
                  <path d="M13 12h8"/><path d="M13 18h8"/><path d="M13 6h8"/>
                  <path d="M3 12h1"/><path d="M3 18h1"/><path d="M3 6h1"/>
                  <path d="M8 12h1"/><path d="M8 18h1"/><path d="M8 6h1"/>
                </svg>
              </button>
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
                <Show when={hasPendingChanges() && !ld()?.hasConflict}>
                  <span
                    class="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-yellow-400"
                    data-testid="sync-button-pending-badge"
                  />
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
                    {currentProjectName()}
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
                        class={`flex items-center justify-between gap-2 ${
                          project.projectSlug === d().projectSlug ? "font-semibold" : ""
                        }`}
                        onClick={() => navigate(`/project/${project.projectSlug}`)}
                        data-testid="project-header-project-item"
                      >
                        <span>{project.name}</span>
                        <button
                          class="btn-icon"
                          disabled={!project.available}
                          title="Open in new window"
                          data-testid="project-header-open-window-button"
                          onPointerDown={(e) => { e.stopPropagation(); }}
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(`/project/${project.projectSlug}`, project.projectSlug);
                          }}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14"
                            viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                            stroke-linecap="round" stroke-linejoin="round"
                          >
                            <path d="M15 3h6v6" />
                            <path d="M10 14 21 3" />
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          </svg>
                        </button>
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
                  <DialogRoot open onOpenChange={() => revalidate("project-page")}>
                    <DialogTitle>Error</DialogTitle>
                    <p class="mb-4 text-sm text-destructive">{e().error}</p>
                    <button class="btn-primary w-full" onClick={() => revalidate("project-page")}>Retry</button>
                  </DialogRoot>
                )}
              </Match>
              <Match when={ld()}>
                {(loaded) => (
                  <Show when={viewMode() === 'forest'} fallback={
                    <KanbanBoard
                      board={loaded().board}
                      projectSlug={d().projectSlug}
                      onEdit={commands.openEdit}
                      onDelete={commands.openDelete}
                      onArchive={commands.openArchive}
                      onViewDetail={commands.openDetail}
                      onReorder={commands.handleReorder}
                      herdrStatuses={herdrTicketStatuses()}
                    />
                  }>
                    <div class="h-[calc(100vh-60px)]">
                      <ForestView
                        board={loaded().board}
                        projectSlug={d().projectSlug}
                        onViewDetail={commands.openDetail}
                        suggestedNextNumber={loaded().suggestedNextNumber}
                        herdrStatuses={herdrTicketStatuses()}
                      />
                    </div>
                  </Show>
                )}
              </Match>
            </Switch>
          </main>

          <CreateTicketDialog
            open={dialogState().createTicketOpen}
            onOpenChange={commands.setCreateTicketOpen}
            onSubmit={commands.handleCreateTicket}
            suggestedNextNumber={ld()?.suggestedNextNumber ?? null}
            projectSlug={d().projectSlug}
          />
          <EditTicketDialog
            open={dialogState().editTicketOpen}
            onOpenChange={commands.setEditTicketOpen}
            ticket={selectionState().selectedTicket}
            onSubmit={commands.handleEditTicket}
          />
          <TicketCleanupDialog
            open={dialogState().cleanupDialogOpen}
            onOpenChange={commands.setCleanupDialogOpen}
            projectSlug={d().projectSlug}
            ticket={selectionState().selectedTicket}
            action={dialogState().cleanupAction}
            onCleanup={commands.handleCleanupAction}
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
              action={addProject}
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
            hasConflict={!!ld()?.hasConflict}
          />
          <ErrorDialog error={syncState().syncError} onClose={() => commands.setSyncError(null)} />
          <LogViewerDialog open={logViewerOpen()} onOpenChange={setLogViewerOpen} />
          <LauncherSettings
            open={dialogState().settingsOpen}
            onOpenChange={(open) => {
              if (open) commands.openSettings();
              else {
                commands.closeSettings();
                revalidate(["project-page", "herdr-agent-statuses"]);
              }
            }}
            projectSlug={d().projectSlug}
            onDeleteProject={async (projectSlug) => {
              const result = await commands.handleDeleteProject(projectSlug);
              if (!result.error) {
                commands.closeSettings();
                const remaining = d().projects.filter((p) => p.projectSlug !== projectSlug);
                await revalidate();
                navigate(
                  remaining[0] ? `/project/${remaining[0].projectSlug}` : "/add-project",
                  { replace: true },
                );
              }
              return result;
            }}
          />
        </div>
        );
      }}
    </Show>
  );
}
