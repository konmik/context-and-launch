import { useParams, useNavigate, revalidate } from "@solidjs/router";
import { AppConfigContext } from '~/components/config/app-config-storage.js';
import { LauncherConfigContext } from '~/components/launcher/shared-launcher-config-storage.js';
import { mergeLauncherConfigs } from '~/core/launcher/launcher-config-data.js';
import {
  Show, For, Switch, Match, Errored, Loading,
  createSignal, createEffect, createMemo, onSettled, lazy, flush, useContext,
} from "solid-js";
import { EllipsisVertical } from "~/components/ui/icons.js";
import { Network } from "~/components/ui/icons.js";
import { ScrollText } from "~/components/ui/icons.js";
import { RefreshCw } from "~/components/ui/icons.js";
import { Check } from "~/components/ui/icons.js";
import { Settings } from "~/components/ui/icons.js";
import { ChevronDown } from "~/components/ui/icons.js";
import { ExternalLink } from "~/components/ui/icons.js";
import { X } from "~/components/ui/icons.js";
import { TriangleAlert } from "~/components/ui/icons.js";
import {
  FloatingWindow, FloatingWindowHeader, FloatingPanelBody,
  FloatingPanelCloseTrigger, FloatingPanelTitle,
} from "~/components/ui/floating-panel";
import { MenuRoot, MenuTrigger, MenuContent, MenuItem, MenuSeparator } from "~/components/ui/menu";

const KanbanBoard = lazy(() => import("~/components/board/KanbanBoard"), undefined);
const ForestView = lazy(() => import("~/components/forest/ForestView"), undefined);
const DiffReview = lazy(() => import("~/components/diff-review/DiffReview"), undefined);
import { getViewMode, setViewMode } from "~/components/forest/forest-local-state.js";
import CreateTicketDialog from "~/components/ticket/CreateTicketDialog";
import TicketCleanupDialog from "~/components/shared/TicketCleanupDialog";
import TicketDetailDialog from "~/components/ticket/TicketDetailDialog";
import ProjectLauncherDialog from "~/components/launcher/ProjectLauncherDialog";
import ConflictDialog from "~/components/shared/ConflictDialog";
import ErrorDialog from "~/components/shared/ErrorDialog";
import AddProjectForm from "~/components/project/AddProjectForm";
import PalettePicker from "~/components/shared/PalettePicker";
import LogViewerDialog from "~/components/shared/LogViewerDialog";
import LauncherSettings from "~/components/launcher/LauncherSettings";
import { useModEnterSubmit, modEnterHint } from "~/lib/use-mod-enter-submit";
import {
  loadProjectPage, getSyncStatus, addProject,
} from "~/components/project/project-api.js";
import { projectSyncRevalidateKeys } from "~/components/shared/revalidate-keys.js";
import {
  createProjectPageController,
  type ProjectPageController,
} from "~/components/project/project-page-controller.js";
import { getSyncPending } from "~/components/ticket/ticket-api.js";
import { openConfigDir } from "~/components/shared/shared-api.js";
import { getProjectLauncherConfig } from "~/components/launcher/launcher-api.js";
import {
  getHerdrAgentStatuses,
  reconcileReviewPromptQueue,
} from "~/components/board/herdr-status-api.js";
import { HerdrStatusesContext } from "~/components/ticket/herdr-statuses-context.js";
import { ShortcutRunnerContext } from "~/components/board/shortcut-runner-context.js";
import { createBoardShortcutRunner } from "~/components/board/board-shortcut-runner.js";
import { ShortcutConfirmationDialog } from "~/components/ticket/ticket-detail-parts.js";
import { paths } from "~/router.js";

function createDeferredSignal<T>(ready: () => boolean, load: () => Promise<T>, placeholder: T) {
  const [state, setState] = createSignal({ value: placeholder });
  const [error, setError] = createSignal<{ cause: unknown }>();

  createEffect(
    () => ready() ? { promise: load() } : undefined,
    {
      effect(request) {
        if (!request) {
          setState({ value: placeholder });
          return;
        }

        let active = true;
        void request.promise.then(
          (next) => {
            if (!active) return;
            setError(undefined);
            setState({ value: next });
          },
          (cause: unknown) => {
            if (active) setError({ cause });
          },
        );
        return () => { active = false; };
      },
      error(cause) {
        setError({ cause });
      },
    },
  );

  return () => {
    const failure = error();
    if (failure) throw failure.cause;
    return state().value;
  };
}

export default function ProjectPage(props?: { ctrl?: ProjectPageController }) {
  const appConfig = useContext(AppConfigContext)!;
  const params = useParams();
  const navigate = useNavigate();
  const projectSlug = () => params.projectSlug ?? "";
  const data = createMemo(() => loadProjectPage(projectSlug()));

  const [deferredPollsReady, setDeferredPollsReady] = createSignal(false);
  createEffect(data, (loaded) => {
    if (!loaded) return;
    const handle = requestIdleCallback(() => setDeferredPollsReady(true));
    return () => cancelIdleCallback(handle);
  });

  const syncStatus = createDeferredSignal(
    deferredPollsReady, () => getSyncStatus(projectSlug()), undefined,
  );

  const [viewMode, setViewModeSignal] = createSignal<'kanban' | 'forest'>('kanban');
  createEffect(projectSlug, (ps) => {
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
    props?.ctrl ?? createProjectPageController({ projectSlug, data });

  function navigateToProject(nextProjectSlug: string) {
    commands.closeReview();
    commands.closeDetail();
    // Dispose the open project overlays before the router replaces their owner.
    flush();
    navigate(paths.project(nextProjectSlug)());
  }

  createEffect(deferredPollsReady, (ready) => {
    if (!ready) return;
    const timer = setInterval(() => void revalidate("project-page"), 30_000);
    return () => clearInterval(timer);
  });

  const sharedLauncherConfig = useContext(LauncherConfigContext)!;
  const projectLauncherConfig = createMemo(async () => {
    const page = data();
    if (page?.status !== "loaded") return undefined;
    return getProjectLauncherConfig(page.projectSlug);
  });
  const launcherConfig = createMemo(() => {
    const project = projectLauncherConfig();
    return project && { ...project, ...mergeLauncherConfigs(sharedLauncherConfig.get(), project.projectConfig) };
  });
  const shortcutRunner = createBoardShortcutRunner({ projectSlug, config: launcherConfig });

  const [logViewerOpen, setLogViewerOpen] = createSignal(false);
  const [projectLauncherOpen, setProjectLauncherOpen] = createSignal(false);
  const hasPendingChanges = createDeferredSignal(
    () => deferredPollsReady() && projectSlug() !== "" && data()?.status === "loaded",
    () => getSyncPending(projectSlug()),
    false,
  );
  createEffect(deferredPollsReady, (ready) => {
    if (!ready) return;
    const timer = setInterval(() => void revalidate("sync-pending"), 10000);
    return () => clearInterval(timer);
  });

  const herdrStatusesResult = createDeferredSignal(
    () => deferredPollsReady() && projectSlug() !== "",
    () => getHerdrAgentStatuses(projectSlug()),
    { kind: "disabled" as const },
  );
  const herdrPollingActive = createMemo(() => {
    const result = herdrStatusesResult();
    return !!result && result.kind !== "disabled";
  });
  createEffect(
    () => deferredPollsReady() ? projectSlug() : "",
    (currentProjectSlug) => {
      if (!currentProjectSlug) return;
      void reconcileReviewPromptQueue(currentProjectSlug)
        .then(() => revalidate("diff-review-queue"))
        .catch((cause: unknown) => console.error("Review Prompt Queue reconciliation failed", cause));
    },
  );
  createEffect(herdrPollingActive, (active) => {
    if (!active) return;
    let running = false;
    const poll = async () => {
      if (running) return;
      running = true;
      try {
        await Promise.all([
          revalidate("herdr-agent-statuses"),
          reconcileReviewPromptQueue(projectSlug()),
        ]);
        await revalidate("diff-review-queue");
	  } catch (error) {
		console.error("Herdr polling failed", error);
      } finally {
        running = false;
      }
    };
    const timer = setInterval(() => void poll(), 5000);
    return () => clearInterval(timer);
  });
  const herdrTicketStatuses = () => {
    const result = herdrStatusesResult();
    return result?.kind === "available" ? result.statusesByFolderName : {};
  };

  const currentProjectName = () => {
    const v = data();
    if (!v) return "";
    return appConfig.get().projects.find((p) => p.projectSlug === v.projectSlug)?.name || v.projectSlug;
  };

  async function recordProjectFocus(projectSlug: string) {
    const result = await appConfig.update(current => ({
      ...current,
      lastUsedProjectSlug: current.projects.some(project => project.projectSlug === projectSlug)
        ? projectSlug : current.lastUsedProjectSlug,
    }));
    if (result.type === 'Failure') setConfigError(result.error);
    else setConfigError(undefined);
  }

  const [configError, setConfigError] = createSignal<string>();

  let lastReportedProjectSlug: string | null = null;
  createEffect(data, (v) => {
    if (v?.status === "loaded" && v.projectSlug !== lastReportedProjectSlug) {
      lastReportedProjectSlug = v.projectSlug;
      void recordProjectFocus(v.projectSlug);
    }
  });

  onSettled(() => {
    const handler = () => {
      const v = data();
      if (v?.status === "loaded") void recordProjectFocus(v.projectSlug);
    };
    window.addEventListener("focus", handler);
    return () => window.removeEventListener("focus", handler);
  });

  createEffect(currentProjectName, (name) => {
    if (name) document.title = `${name} - Context & Launch`;
  });

  function SyncControls() {
    const hasConflict = createMemo(() =>
      syncState().conflictDetected || (syncStatus()?.hasConflict ?? false));
    createEffect(hasConflict, (conflict) => {
      if (!conflict) return;
      const timer = setInterval(() => void revalidate(projectSyncRevalidateKeys), 5000);
      return () => clearInterval(timer);
    });
    return (
      <>
        <button
          onClick={(event) => {
            if (hasConflict()) commands.setConflictDialogOpen(true);
            else {
              event.currentTarget.disabled = true;
              void commands.handleSync();
            }
          }}
          disabled={syncState().syncing}
          class={`btn-icon relative ${
            hasConflict() ? "border-destructive text-destructive hover:bg-destructive/10" : ""
          }`}
          title={hasConflict() ? "Resolve conflicts" : "Sync tickets"}
          data-testid="sync-button-trigger"
        >
          <Show when={syncState().syncSuccess} fallback={<RefreshCw size={16} />}>
            <Check size={16} data-testid="sync-button-check-icon" />
          </Show>
          <Show when={hasConflict()}>
            <span
              class={
                "absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center"
                + " rounded-full bg-destructive text-[8px] font-bold leading-none"
                + " text-destructive-foreground"
              }
              data-testid="sync-button-conflict-badge"
            >!</span>
          </Show>
          <Show when={hasPendingChanges() && !hasConflict()}>
            <span
              class="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-warning"
              data-testid="sync-button-pending-badge"
            />
          </Show>
        </button>
        <ConflictDialog
          open={dialogState().conflictDialogOpen}
          onOpenChange={commands.setConflictDialogOpen}
          onResolve={commands.handleConflictResolve}
          onAbort={commands.handleConflictAbort}
          projectSlug={projectSlug()}
          hasConflict={hasConflict()}
        />
      </>
    );
  }

  function SyncStatusErrorButton(props: { error: unknown }) {
    const message = () =>
      props.error instanceof Error ? props.error.message : String(props.error);
    return (
      <button
        class="btn-icon border-destructive text-destructive hover:bg-destructive/10"
        title={message()}
        data-testid="sync-status-error-button"
        onClick={() => commands.setSyncError({
          title: "Sync status unavailable",
          description: message(),
        })}
      >
        <TriangleAlert size={16} />
      </button>
    );
  }

  let addProjectDialogRef: HTMLDivElement | undefined;
  useModEnterSubmit({
    onSubmit: () => { addProjectDialogRef?.querySelector("form")?.requestSubmit(); },
    disabled: () => false,
    active: () => dialogState().addProjectDialogOpen,
  });

  return (<>
    <Show when={data()} fallback={<p>Loading...</p>}>
      {(_) => {
        const d = () => data()!;
        const ld = () => { const v = d(); return v.status === 'loaded' ? v : undefined; };
        const unavail = () => { const v = d(); return v.status === 'unavailable' ? v : undefined; };
        const pageErr = () => { const v = d(); return v.status === 'error' ? v : undefined; };
        return (
        <div class="flex h-screen flex-col overflow-hidden">
          <header class="flex shrink-0 items-center justify-between border-b border-border px-4 py-5">
            <div class="flex items-center justify-start">
              <button
                class="btn-primary"
                style={{ height: "2.25rem" }}
                onClick={commands.openCreate}
                data-testid="project-header-new-ticket-button"
              >+ New Ticket</button>
            </div>
            <div class="flex flex-1 items-center justify-center gap-3">
              <h1 class="text-xl font-semibold">{currentProjectName()}</h1>
              <MenuRoot
                trigger={
                  <MenuTrigger
                    class="btn-icon"
                    aria-label="Project actions"
                    data-testid="project-header-title-menu-trigger"
                  >
                    <EllipsisVertical size={16} />
                  </MenuTrigger>
                }
              >
                <MenuContent class="min-w-[180px]">
                  <MenuItem
                    value="launch-agent"
                    onClick={() => setProjectLauncherOpen(true)}
                    data-testid="project-header-launch-agent-menuitem"
                  >Launch an agent</MenuItem>
                  <MenuItem
                    value="open-tickets-folder"
                    onClick={() => openConfigDir("tickets", d().projectSlug)}
                    data-testid="project-header-open-tickets-folder-menuitem"
                  >Open tickets folder</MenuItem>
                  <MenuItem
                    value="open-project-folder"
                    onClick={() => openConfigDir("repo", d().projectSlug)}
                    data-testid="project-header-open-project-folder-menuitem"
                  >Open project folder</MenuItem>
                </MenuContent>
              </MenuRoot>
            </div>
            <div class="flex items-center justify-end gap-2">
              <PalettePicker />
              <button
                onClick={toggleViewMode}
                class="btn-icon"
                title={viewMode() === 'kanban' ? 'Forest view' : 'Kanban view'}
                data-testid="project-header-forest-toggle-button"
              >
                <Network size={16} />
              </button>
              <button
                onClick={() => setLogViewerOpen(true)}
                class="btn-icon"
                title="Application logs"
                data-testid="project-header-logs-button"
              >
                <ScrollText size={16} />
              </button>
              <Errored fallback={(error) => <SyncStatusErrorButton error={error()} />}>
                <SyncControls />
              </Errored>
              <button
                onClick={commands.openSettings}
                class="btn-icon"
                title="Settings"
                data-testid="project-header-settings-button"
              >
                <Settings size={16} />
              </button>
              <MenuRoot
                trigger={
                  <MenuTrigger class="btn-secondary" data-testid="project-header-project-dropdown-trigger">
                    {currentProjectName()}
                    <ChevronDown size={16} class="ml-2" />
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
                        onClick={() => navigateToProject(project.projectSlug)}
                        data-testid="project-header-project-item"
                      >
                        <span class="flex min-w-0 items-center gap-1.5">
                          <span
                            class="w-2 shrink-0 text-center font-mono text-muted-foreground"
                            aria-hidden="true"
                          >{project.projectSlug === d().projectSlug ? "#" : ""}</span>
                          <span class="truncate">{project.name}</span>
                        </span>
                        <button
                          class="btn-icon"
                          disabled={!project.available}
                          title="Open in new window"
                          data-testid="project-header-open-window-button"
                          onPointerDown={(e) => { e.stopPropagation(); }}
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(paths.project(project.projectSlug)(), project.projectSlug);
                          }}
                        >
                          <ExternalLink size={14} />
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

          <main class="flex flex-1 flex-col min-h-0">
            <HerdrStatusesContext
              value={(folderName) => herdrTicketStatuses()[folderName]}
            >
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
                    <div
                      class="mx-auto mt-10 max-w-2xl rounded-lg border border-destructive/40 bg-card p-6"
                      role="alert"
                      data-testid="project-load-error"
                    >
                      <h2 class="mb-2 text-lg font-semibold">Tickets could not be loaded</h2>
                      <p class="mb-4 whitespace-pre-wrap text-sm text-destructive">{e().error}</p>
                      <button class="btn-primary" onClick={() => revalidate("project-page")}>Retry</button>
                    </div>
                  )}
                </Match>
                <Match when={ld()}>
                  {(_) => {
                    const loaded = () => ld()!;
                    return (
                    <Show when={selectionState().reviewTicket} fallback={
                      <Show when={viewMode() === 'forest'} keyed fallback={
                        <ShortcutRunnerContext value={shortcutRunner}>
                          <KanbanBoard
                            board={loaded().board}
                            projectSlug={d().projectSlug}
                            onDelete={commands.openDelete}
                            onArchive={commands.openArchive}
                            onViewDetail={commands.openDetail}
                            onReviewChanges={commands.openReview}
                            onReorder={commands.handleReorder}
                          />
                        </ShortcutRunnerContext>
                      }>
                        <div class="min-h-0 flex-1">
                          <ForestView
                            board={loaded().board}
                            projectSlug={d().projectSlug}
                            onViewDetail={commands.openDetail}
                            onClose={toggleViewMode}
                            suggestedNextNumber={loaded().suggestedNextNumber}
                          />
                        </div>
                      </Show>
                    }>
                      {(reviewTicket) => (
                      <div class="min-h-0 flex-1">
                        <Loading fallback={<p class="p-4 text-sm text-muted-foreground">Loading Diff Review...</p>}>
                          <DiffReview
                            projectSlug={d().projectSlug}
                            projectName={currentProjectName()}
                            ticket={reviewTicket()}
                            onClose={commands.closeReview}
                          />
                        </Loading>
                      </div>
                      )}
                    </Show>
                    );
                  }}
                </Match>
              </Switch>
            </HerdrStatusesContext>
          </main>

          <CreateTicketDialog
            open={dialogState().createTicketOpen}
            onOpenChange={commands.setCreateTicketOpen}
            onSubmit={commands.handleCreateTicket}
            suggestedNextNumber={ld()?.suggestedNextNumber ?? null}
            projectSlug={d().projectSlug}
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
            onReviewChanges={commands.openReview}
            projectSlug={d().projectSlug}
            ticket={selectionState().detailTicket}
          />
          <ProjectLauncherDialog
            open={projectLauncherOpen()}
            onOpenChange={setProjectLauncherOpen}
            projectSlug={d().projectSlug}
          />

          <FloatingWindow
            open={dialogState().addProjectDialogOpen}
            onOpenChange={(d) => { if (!d.open) commands.closeAddProject(); }}
            defaultSize={{ width: 480, height: 560 }}
            minSize={{ width: 360, height: 320 }}
            fitContent
            persistRect
          >
            <FloatingWindowHeader
              title={<FloatingPanelTitle>Add Project</FloatingPanelTitle>}
              actions={
                <FloatingPanelCloseTrigger aria-label="Close">
                  <X size={16} />
                </FloatingPanelCloseTrigger>
              }
            />
            <FloatingPanelBody>
              <div ref={addProjectDialogRef} class="px-6 py-4">
                <AddProjectForm
                  action={addProject}
                  onSuccess={(s) => {
                    commands.closeAddProject();
                    navigateToProject(s);
                  }}
                  submitTitle={modEnterHint()}
                />
              </div>
            </FloatingPanelBody>
          </FloatingWindow>

          <ShortcutConfirmationDialog
            info={shortcutRunner.confirmation()}
            running={shortcutRunner.running() !== ""}
            onCancel={() => shortcutRunner.setConfirmation(undefined)}
            onProceed={(n) => { shortcutRunner.setConfirmation(undefined); shortcutRunner.proceed(n); }}
          />
          <ErrorDialog error={shortcutRunner.error()} onClose={() => shortcutRunner.setError(null)} />
          <ErrorDialog error={syncState().syncError} onClose={() => commands.setSyncError(null)} />
          <ErrorDialog
            error={configError() ? { title: 'Configuration save failed', description: configError()! } : null}
            onClose={() => setConfigError(undefined)}
          />
          <LogViewerDialog open={logViewerOpen()} onOpenChange={setLogViewerOpen} />
        </div>
        );
      }}
    </Show>
    <Loading fallback={null}>
      <LauncherSettings
        open={dialogState().settingsOpen}
        onOpenChange={(open) => {
          if (open) commands.openSettings();
          else {
            commands.closeSettings();
            revalidate(["project-page", "herdr-agent-statuses"]);
          }
        }}
        projectSlug={projectSlug()}
        onDeleteProject={async (deletedProjectSlug) => {
          const result = await commands.handleDeleteProject(deletedProjectSlug);
          if (!result.error) {
            commands.closeSettings();
            const remaining = data()?.projects.filter(
              (project) => project.projectSlug !== deletedProjectSlug,
            ) ?? [];
            await revalidate();
            navigate(
              remaining[0] ? paths.project(remaining[0].projectSlug)() : paths["add-project"](),
              { replace: true },
            );
          }
          return result;
        }}
      />
    </Loading>
  </>);
}
