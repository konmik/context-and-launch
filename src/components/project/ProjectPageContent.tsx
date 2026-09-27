import type { JSX } from '@solidjs/web'
import { useParams, useNavigate, revalidate } from '@solidjs/router'
import { AppConfigContext } from '~/components/config/app-config-storage.js'
import { BoardConfigContext } from '~/components/board/board-config-storage.js'
import { TicketOrderContext, createTicketOrderStorage } from '~/components/board/ticket-order-storage.js'
import { LauncherConfigContext } from '~/components/launcher/shared-launcher-config-storage.js'
import { mergeLauncherConfigs } from '~/core/launcher/launcher-config-data.js'
import { Show, For, Switch, Match, Errored, Loading, createSignal, createEffect, createMemo, onSettled, lazy, useContext } from 'solid-js'
import { EllipsisVertical } from '~/components/ui/icons/EllipsisVertical.js'
import { Network } from '~/components/ui/icons/Network.js'
import { ScrollText } from '~/components/ui/icons/ScrollText.js'
import { Settings } from '~/components/ui/icons/Settings.js'
import { ChevronDown } from '~/components/ui/icons/ChevronDown.js'
import { ExternalLink } from '~/components/ui/icons/ExternalLink.js'
import { X } from '~/components/ui/icons/X.js'
import SyncControls from '~/components/project/SyncControls.js'
import SyncStatusErrorButton from '~/components/project/SyncStatusErrorButton.js'
import { FloatingWindow } from '~/components/ui/FloatingWindow.js'
import { FloatingWindowHeader } from '~/components/ui/FloatingWindowHeader.js'
import { FloatingPanelBody } from '~/components/ui/FloatingPanelBody.js'
import { FloatingPanelCloseTrigger } from '~/components/ui/FloatingPanelCloseTrigger.js'
import { FloatingPanelTitle } from '~/components/ui/FloatingPanelTitle.js'
import { MenuRoot } from '~/components/ui/MenuRoot.js'
import { MenuTrigger } from '~/components/ui/MenuTrigger.js'
import { MenuContent } from '~/components/ui/MenuContent.js'
import { MenuItem } from '~/components/ui/MenuItem.js'
import { MenuSeparator } from '~/components/ui/MenuSeparator.js'
import { getViewMode, setViewMode } from '~/components/forest/forest-local-state.js'
import CreateTicketDialog from '~/components/ticket/CreateTicketDialog.js'
import TicketCleanupDialog from '~/components/shared/TicketCleanupDialog.js'
import TicketDetailDialog from '~/components/ticket/TicketDetailDialog.js'
import ProjectLauncherDialog from '~/components/launcher/ProjectLauncherDialog'
import { useErrorReporter } from '~/components/shared/error-presentation.js'
import { errorPayload } from '~/core/shared/errors.js'
import LoadError from '~/components/shared/LoadError.js'
import AddProjectForm from '~/components/project/AddProjectForm.js'
import PalettePicker from '~/components/shared/PalettePicker'
import DebugToastButton from '~/components/shared/DebugToastButton'
import LogViewerDialog from '~/components/shared/LogViewerDialog'
import LauncherSettings from '~/components/launcher/LauncherSettings.js'
import { useModEnterSubmit, modEnterHint } from '~/lib/use-mod-enter-submit'
import { loadProjectPage, getSyncStatus, addProject } from '~/components/project/project-api.js'
import { createProjectPageController, type ProjectPageController } from '~/components/project/project-page-controller.js'
import { getSyncPending } from '~/components/ticket/ticket-api.js'
import { openConfigDir } from '~/components/shared/shared-api.js'
import { getProjectLauncherMetadata } from '~/components/launcher/launcher-api.js'
import { ProjectLauncherConfigContext } from '~/components/launcher/project-launcher-config-storage.js'
import { getHerdrAgentStatuses, reconcileReviewPromptQueue } from '~/components/board/herdr-status-api.js'
import { HerdrStatusesContext } from '~/components/ticket/herdr-statuses-context.js'
import { ShortcutRunnerContext } from '~/components/board/shortcut-runner-context.js'
import { createBoardShortcutRunner } from '~/components/board/board-shortcut-runner.js'
import { ShortcutConfirmationDialog } from '~/components/ticket/ShortcutConfirmationDialog.js'
import { paths } from '~/router.js'
import { recordAppProjectFocus } from '~/components/config/app-config-api.js'

const KanbanBoard = lazy(() => import('~/components/board/KanbanBoard'), undefined)

const ForestView = lazy(() => import('~/components/forest/ForestView'), undefined)

const DiffReview = lazy(() => import('~/components/diff-review/DiffReview'), undefined)

function createDeferredSignal<T>(ready: () => boolean, load: () => Promise<T>, placeholder: T): () => T {
  const [state, setState] = createSignal({
    value: placeholder,
  })
  const [error, setError] = createSignal<{
    cause: unknown
  }>()
  createEffect(
    () =>
      ready()
        ? {
            promise: load(),
          }
        : undefined,
    {
      effect(request): (() => void) | undefined {
        if (!request) {
          setState({
            value: placeholder,
          })
          return
        }
        let active = true
        void request.promise.then(
          (next) => {
            if (!active) return
            setError(undefined)
            setState({
              value: next,
            })
          },
          (cause: unknown) => {
            if (active)
              setError({
                cause,
              })
          },
        )
        return () => {
          active = false
        }
      },
      error(cause) {
        setError({
          cause,
        })
      },
    },
  )
  return () => {
    const failure = error()
    if (failure) throw failure.cause
    return state().value
  }
}

export function ProjectPageContent(props: { ctrl?: ProjectPageController }): JSX.Element {
  const appConfig = useContext(AppConfigContext)!
  const params = useParams()
  const navigate = useNavigate()
  const projectSlug = () => params.projectSlug ?? ''
  const errors = useErrorReporter()
  const boards = useContext(BoardConfigContext)!
  const data = createDeferredSignal(
    () => !!projectSlug(),
    () => loadProjectPage(projectSlug()),
    undefined,
  )
  const [deferredPollsReady, setDeferredPollsReady] = createSignal(false)
  createEffect(data, (loaded) => {
    if (!loaded) return
    const handle = requestIdleCallback(() => setDeferredPollsReady(true))
    return () => cancelIdleCallback(handle)
  })
  const syncStatus = createDeferredSignal(deferredPollsReady, () => getSyncStatus(projectSlug()), undefined)
  const [viewMode, setViewModeSignal] = createSignal<'kanban' | 'forest'>('kanban')
  createEffect(projectSlug, (ps) => {
    if (!ps) return
    setViewModeSignal(getViewMode(localStorage, ps))
  })

  function toggleViewMode() {
    const ps = projectSlug()
    if (!ps) return
    const next = viewMode() === 'kanban' ? 'forest' : 'kanban'
    setViewMode(localStorage, ps, next)
    setViewModeSignal(next)
  }

  const { dialogState, syncState, selectionState, commands } =
    props?.ctrl ??
    createProjectPageController({
      onError: errors.report,
      projectSlug,
      data,
    })
  createEffect(deferredPollsReady, (ready) => {
    if (!ready) return
    const timer = setInterval(() => void revalidate('project-page'), 30000)
    return () => clearInterval(timer)
  })
  const sharedLauncherConfig = useContext(LauncherConfigContext)!
  const projectLauncherConfig = useContext(ProjectLauncherConfigContext)!
  const projectMetadata = createMemo(async () => {
    const page = data()
    if (page?.status !== 'loaded') return undefined
    return getProjectLauncherMetadata(page.projectSlug)
  })
  const launcherConfig = createMemo(() => {
    const project = projectMetadata()
    return (
      project && {
        ...project,
        ...mergeLauncherConfigs(sharedLauncherConfig.get(), projectLauncherConfig.get()),
      }
    )
  })
  const shortcutRunner = createBoardShortcutRunner({
    onError: errors.report,
    projectSlug,
    config: launcherConfig,
  })
  const [logViewerOpen, setLogViewerOpen] = createSignal(false)
  const [projectLauncherOpen, setProjectLauncherOpen] = createSignal(false)
  const hasPendingChanges = createDeferredSignal(
    () => deferredPollsReady() && projectSlug() !== '' && data()?.status === 'loaded',
    () => getSyncPending(projectSlug()),
    false,
  )
  createEffect(deferredPollsReady, (ready) => {
    if (!ready) return
    const timer = setInterval(() => void revalidate('sync-pending'), 10000)
    return () => clearInterval(timer)
  })
  const herdrStatusesResult = createDeferredSignal(
    () => deferredPollsReady() && projectSlug() !== '',
    () => getHerdrAgentStatuses(projectSlug()),
    {
      kind: 'disabled' as const,
    },
  )
  const herdrPollingActive = createMemo(() => {
    const result = herdrStatusesResult()
    return !!result && result.kind !== 'disabled'
  })
  let reportedStatusError: string | undefined
  createEffect(herdrStatusesResult, (result) => {
    if (result?.kind !== 'unavailable') {
      reportedStatusError = undefined
      return
    }
    const fingerprint = JSON.stringify(result.error)
    if (reportedStatusError === fingerprint) return
    reportedStatusError = fingerprint
    errors.enqueueToast(result.error)
  })
  const reportedDeliveryErrors = new Map<string, Set<string>>()
  async function reconcileReviewErrors(currentProjectSlug: string): Promise<void> {
    try {
      const result = await reconcileReviewPromptQueue(currentProjectSlug)
      if (result.type === 'Failure') {
        errors.enqueueToast(result.error)
        return
      }
      const previous = reportedDeliveryErrors.get(currentProjectSlug)
      const current = new Set<string>()
      for (const delivery of result.value) {
        const key = JSON.stringify(delivery)
        current.add(key)
        if (!previous?.has(key)) errors.enqueueToast(delivery.error)
      }
      reportedDeliveryErrors.set(currentProjectSlug, current)
    } catch (cause) {
      errors.enqueueToast(errorPayload(cause, 'Review queue reconciliation failed'))
    }
  }
  createEffect(
    () => (deferredPollsReady() ? projectSlug() : ''),
    (currentProjectSlug) => {
      if (!currentProjectSlug) return
      void reconcileReviewErrors(currentProjectSlug)
    },
  )
  createEffect(herdrPollingActive, (active) => {
    if (!active) return
    let running = false
    const poll = async () => {
      if (running) return
      running = true
      try {
        await Promise.all([revalidate('herdr-agent-statuses'), reconcileReviewErrors(projectSlug())])
      } catch (error) {
        errors.enqueueToast(errorPayload(error, 'Agent status polling failed'))
      } finally {
        running = false
      }
    }
    const timer = setInterval(() => void poll(), 5000)
    return () => clearInterval(timer)
  })
  const herdrTicketStatuses = () => {
    const result = herdrStatusesResult()
    return result?.kind === 'available' ? result.statusesByFolderName : {}
  }
  const currentProjectName = () => {
    const v = data()
    if (!v) return ''
    return appConfig.get().projects.find((p) => p.projectSlug === v.projectSlug)?.name || v.projectSlug
  }

  async function recordProjectFocus(projectSlug: string) {
    const result = await recordAppProjectFocus(projectSlug)
    if (result.type === 'Failure') errors.enqueueToast(result.error)
  }

  let lastReportedProjectSlug: string | null = null
  createEffect(data, (v) => {
    if (v?.status === 'loaded' && v.projectSlug !== lastReportedProjectSlug) {
      lastReportedProjectSlug = v.projectSlug
      void recordProjectFocus(v.projectSlug)
    }
  })
  onSettled(() => {
    const handler = () => {
      const v = data()
      if (v?.status === 'loaded') void recordProjectFocus(v.projectSlug)
    }
    window.addEventListener('focus', handler)
    return () => window.removeEventListener('focus', handler)
  })
  createEffect(currentProjectName, (name) => {
    if (name) document.title = `${name} - Context & Launch`
  })

  let addProjectDialogRef: HTMLDivElement | undefined
  useModEnterSubmit({
    onSubmit: () => {
      addProjectDialogRef?.querySelector('form')?.requestSubmit()
    },
    disabled: () => false,
    active: () => dialogState().addProjectDialogOpen,
  })
  return (
    <>
      <Show when={data()} fallback={<p>Loading...</p>}>
        {(_) => {
          const d = () => data()!
          const ld = () => {
            const v = d()
            return v.status === 'loaded' ? v : undefined
          }
          const unavail = () => {
            const v = d()
            return v.status === 'unavailable' ? v : undefined
          }
          const pageErr = () => {
            const v = d()
            return v.status === 'error' ? v : undefined
          }
          return (
            <div class="flex h-screen flex-col overflow-hidden">
              <header class="flex shrink-0 items-center justify-between border-b border-border px-4 py-5">
                <div class="flex items-center justify-start">
                  <button
                    class="btn-primary"
                    style={{
                      height: '2.25rem',
                    }}
                    onClick={commands.openCreate}
                    data-testid="project-header-new-ticket-button"
                  >
                    + New Ticket
                  </button>
                </div>
                <div class="flex flex-1 items-center justify-center gap-3">
                  <h1 class="text-xl font-semibold">{currentProjectName()}</h1>
                  <MenuRoot
                    trigger={
                      <MenuTrigger class="btn-icon" aria-label="Project actions" data-testid="project-header-title-menu-trigger">
                        <EllipsisVertical size={16} />
                      </MenuTrigger>
                    }
                  >
                    <MenuContent class="min-w-[180px]">
                      <MenuItem
                        value="launch-agent"
                        onClick={() => setProjectLauncherOpen(true)}
                        data-testid="project-header-launch-agent-menuitem"
                      >
                        Launch an agent
                      </MenuItem>
                      <MenuItem
                        value="open-tickets-folder"
                        onClick={() => errors.runAndReportErrors(() => openConfigDir('tickets', d().projectSlug))}
                        data-testid="project-header-open-tickets-folder-menuitem"
                      >
                        Open tickets folder
                      </MenuItem>
                      <MenuItem
                        value="open-project-folder"
                        onClick={() => errors.runAndReportErrors(() => openConfigDir('repo', d().projectSlug))}
                        data-testid="project-header-open-project-folder-menuitem"
                      >
                        Open project folder
                      </MenuItem>
                    </MenuContent>
                  </MenuRoot>
                </div>
                <div class="flex items-center justify-end gap-2">
                  <DebugToastButton />
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
                    <SyncControls
                      syncState={syncState}
                      dialogState={dialogState}
                      commands={commands}
                      syncStatus={syncStatus()}
                      hasPendingChanges={hasPendingChanges()}
                      projectSlug={projectSlug()}
                    />
                  </Errored>
                  <button onClick={commands.openSettings} class="btn-icon" title="Settings" data-testid="project-header-settings-button">
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
                            class={`flex items-center justify-between gap-2 ${project.projectSlug === d().projectSlug ? 'font-semibold' : ''}`}
                            onClick={() => navigate(paths.project(project.projectSlug)())}
                            data-testid="project-header-project-item"
                          >
                            <span class="flex min-w-0 items-center gap-1.5">
                              <span class="w-2 shrink-0 text-center font-mono text-muted-foreground" aria-hidden="true">
                                {project.projectSlug === d().projectSlug ? '#' : ''}
                              </span>
                              <span class="truncate">{project.name}</span>
                            </span>
                            <button
                              class="btn-icon"
                              disabled={!project.available}
                              title="Open in new window"
                              data-testid="project-header-open-window-button"
                              onPointerDown={(e) => {
                                e.stopPropagation()
                              }}
                              onClick={(e) => {
                                e.stopPropagation()
                                window.open(paths.project(project.projectSlug)(), project.projectSlug)
                              }}
                            >
                              <ExternalLink size={14} />
                            </button>
                          </MenuItem>
                        )}
                      </For>
                      <MenuSeparator />
                      <MenuItem value="add-project" onClick={commands.openAddProject} data-testid="project-header-add-project-menuitem">
                        Add project...
                      </MenuItem>
                    </MenuContent>
                  </MenuRoot>
                </div>
              </header>

              <main class="flex flex-1 flex-col min-h-0">
                <HerdrStatusesContext value={(folderName) => herdrTicketStatuses()[folderName]}>
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
                        <div data-testid="project-load-error">
                          <LoadError error={e().error} onRetry={() => void revalidate('project-page')} />
                        </div>
                      )}
                    </Match>
                    <Match when={ld()}>
                      {(_) => {
                        const loaded = () => ld()!
                        const ticketOrder = createTicketOrderStorage({
                          get projectSlug() {
                            return loaded().projectSlug
                          },
                          get order() {
                            return loaded().board.ticketOrder
                          },
                        })
                        const board = () => {
                          const definitions = boards.get()
                          const id = appConfig.get().projects.find((p) => p.projectSlug === projectSlug())?.boardId
                          return {
                            ...loaded().board,
                            columns: (definitions.find((b) => b.id === id) ?? definitions[0]).columns,
                          }
                        }
                        return (
                          <Show
                            when={selectionState().reviewTicket}
                            fallback={
                              <Show
                                when={viewMode() === 'forest'}
                                keyed
                                fallback={
                                  <ShortcutRunnerContext value={shortcutRunner}>
                                    <TicketOrderContext value={ticketOrder}>
                                      <KanbanBoard
                                        board={board()}
                                        projectSlug={d().projectSlug}
                                        onDelete={commands.openDelete}
                                        onArchive={commands.openArchive}
                                        onViewDetail={commands.openDetail}
                                        onReviewChanges={commands.openReview}
                                      />
                                    </TicketOrderContext>
                                  </ShortcutRunnerContext>
                                }
                              >
                                <div class="min-h-0 flex-1">
                                  <ForestView
                                    board={board()}
                                    projectSlug={d().projectSlug}
                                    onViewDetail={commands.openDetail}
                                    onClose={toggleViewMode}
                                    suggestedNextNumber={loaded().suggestedNextNumber}
                                  />
                                </div>
                              </Show>
                            }
                          >
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
                        )
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
                onArchive={commands.openArchive}
                onDelete={commands.openDelete}
                onReviewChanges={commands.openReview}
                projectSlug={d().projectSlug}
                ticket={selectionState().detailTicket}
              />
              <ProjectLauncherDialog open={projectLauncherOpen()} onOpenChange={setProjectLauncherOpen} projectSlug={d().projectSlug} />

              <FloatingWindow
                open={dialogState().addProjectDialogOpen}
                onOpenChange={(d) => {
                  if (!d.open) commands.closeAddProject()
                }}
                defaultSize={{
                  width: 480,
                  height: 560,
                }}
                minSize={{
                  width: 360,
                  height: 320,
                }}
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
                        commands.closeAddProject()
                        navigate(paths.project(s)())
                      }}
                      submitTitle={modEnterHint()}
                    />
                  </div>
                </FloatingPanelBody>
              </FloatingWindow>

              <ShortcutConfirmationDialog
                info={shortcutRunner.confirmation()}
                running={shortcutRunner.running() !== ''}
                onCancel={() => shortcutRunner.setConfirmation(undefined)}
                onProceed={(n) => {
                  shortcutRunner.setConfirmation(undefined)
                  shortcutRunner.proceed(n)
                }}
              />
              <LogViewerDialog open={logViewerOpen()} onOpenChange={setLogViewerOpen} />
            </div>
          )
        }}
      </Show>
      <Loading fallback={null}>
        <LauncherSettings
          open={dialogState().settingsOpen}
          onOpenChange={(open) => {
            if (open) commands.openSettings()
            else {
              commands.closeSettings()
              revalidate(['project-page', 'herdr-agent-statuses'])
            }
          }}
          projectSlug={projectSlug()}
          onDeleteProject={async (deletedProjectSlug) => {
            const result = await commands.handleDeleteProject(deletedProjectSlug)
            if (result.type === 'Success') {
              commands.closeSettings()
              const remaining = data()?.projects.filter((project) => project.projectSlug !== deletedProjectSlug) ?? []
              await revalidate()
              navigate(remaining[0] ? paths.project(remaining[0].projectSlug)() : paths['add-project'](), {
                replace: true,
              })
            }
            return result
          }}
        />
      </Loading>
    </>
  )
}
