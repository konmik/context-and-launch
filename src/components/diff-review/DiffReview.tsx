import type { JSX } from '@solidjs/web'
import type { SelectedLineRange } from '@pierre/diffs'
import { revalidate } from '@solidjs/router'
import { Errored, For, Show, createEffect, createMemo, createSignal, useContext, onSettled, onCleanup } from 'solid-js'
import { createStoredState } from '~/util/stored-state.js'
import { success } from '~/util/result.js'
import { ArrowDownToLine } from '~/components/ui/icons/ArrowDownToLine.js'
import { Check } from '~/components/ui/icons/Check.js'
import { ChevronDown } from '~/components/ui/icons/ChevronDown.js'
import { FileWarning } from '~/components/ui/icons/FileWarning.js'
import { GitCompareArrows } from '~/components/ui/icons/GitCompareArrows.js'
import { Pause } from '~/components/ui/icons/Pause.js'
import { Play } from '~/components/ui/icons/Play.js'
import { RefreshCw } from '~/components/ui/icons/RefreshCw.js'
import { Send } from '~/components/ui/icons/Send.js'
import { WrapText } from '~/components/ui/icons/WrapText.js'
import { X } from '~/components/ui/icons/X.js'
import type { TicketInfo } from '~/core/ticket/ticket-store.js'
import { ticketAgentKey, ticketAgentWorktrees } from '~/core/ticket/ticket-worktrees.js'
import type { DiffLayout, DiffLineOverflow, DiffScope, ReviewFileSnapshot, ReviewPace } from '~/core/diff-review/diff-review-types.js'
import { buildReviewPromptSnapshot, reviewSelectionStillExists } from '~/core/diff-review/diff-review-model.js'
import { reuseUnchangedFiles } from '~/core/diff-review/review-file-identity.js'
import { renderReviewPrompt } from '~/core/diff-review/review-prompt-text.js'
import {
  fileIsReviewed,
  nextUnreviewedChange,
  unreviewedChangeCount,
  type ReviewChangeLocation,
} from '~/core/diff-review/review-navigation.js'
import { useHerdrStatuses } from '../ticket/herdr-statuses-context.js'
import { LauncherConfigContext } from '../launcher/shared-launcher-config-storage.js'
import { ProjectLauncherConfigContext } from '../launcher/project-launcher-config-storage.js'
import { mergeLauncherConfigs } from '~/core/launcher/launcher-config-data.js'
import { DiffReviewContext, ReviewAgentStatusContext, createReviewedLineTracker } from './diff-review-storage.js'
import { useErrorReporter } from '../shared/error-presentation.js'
import { errorPayload } from '~/core/shared/errors.js'
import { createStoredConfig } from '~/util/stored-config.js'
import { readDiffReviewState, saveDiffReviewState, releaseDiffReviewState, readReviewAgentStatus } from './diff-review-state-api.js'
import { enqueueReviewPrompt, getReviewSnapshot } from './diff-review-api.js'
import { buildDiffReviewFileTree, diffReviewFilePathsInTreeOrder } from './diff-review-file-tree.js'
import DiffSurface from './DiffSurface.js'
import ReviewPromptComposer, { type ActiveSelection } from './ReviewPromptComposer.js'
import ReviewPromptQueueList from './ReviewPromptQueueList.js'
import { type FileReviewStatus } from './file-review-status.js'
import { DiffLoadError } from './DiffLoadError.js'
import { DiffScopeUnavailable } from './DiffScopeUnavailable.js'
import { FileTree } from './FileTree.js'
import { ReviewStateIcon } from './ReviewStateIcon.js'

const SCOPE_LABELS = {
  all: 'All Changes',
  branch: 'Branch Changes',
  working: 'Uncommitted Changes',
  'last-commit': 'Last Commit Changes',
}

function isDiffScope(value: string): value is DiffScope {
  return Object.hasOwn(SCOPE_LABELS, value)
}

const TREE_WIDTH_DEFAULT = 270

const TREE_WIDTH_MIN = 180

const TREE_WIDTH_MAX = 480

interface ActiveComposer {
  selection?: ActiveSelection
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function reuseFilePaths(previous: string[], files: ReviewFileSnapshot[]): string[] {
  const current = files.map((file) => file.path)
  return current.length === previous.length && current.every((filePath, index) => filePath === previous[index]) ? previous : current
}

interface DiffReviewProps {
  projectSlug: string
  projectName: string
  ticket: TicketInfo
  onClose(): void
}

export default function DiffReview(props: DiffReviewProps): JSX.Element {
  const [selectedWorktreePath, setSelectedWorktreePath] = createSignal(props.ticket.agentWorktreeDir)
  const selectedTicket = createMemo(() => {
    const selected = ticketAgentWorktrees(props.ticket).find((entry) => entry.worktreePath === selectedWorktreePath())
    return selected ? { ...props.ticket, agentWorktreeDir: selected.worktreePath, agentWorktreeBranchName: selected.branchName } : props.ticket
  })
  return (
    <Show when={selectedTicket()} keyed>
      {(ticket) => <DiffReviewContent {...props} ticket={ticket} onSelectWorktree={setSelectedWorktreePath} />}
    </Show>
  )
}

function DiffReviewContent(props: DiffReviewProps & { onSelectWorktree(worktreePath: string): void }): JSX.Element {
  const herdrStatus = useHerdrStatuses()
  const [scope, setScope] = createSignal<DiffScope>()
  const [pace, setPace] = createSignal<ReviewPace>('live')
  const [layout, setLayout] = createSignal<DiffLayout>('split')
  const [lineOverflow, setLineOverflow] = createSignal<DiffLineOverflow>('scroll')
  const [treeWidth, setTreeWidth] = createSignal(TREE_WIDTH_DEFAULT)
  const [activePath, setActivePath] = createSignal('')
  const [composer, setComposer] = createSignal<ActiveComposer>()
  const [feedback, setFeedback] = createSignal('')
  const errors = useErrorReporter(() => composer() !== undefined)
  const [sending, setSending] = createSignal(false)
  const [refreshing, setRefreshing] = createSignal(false)
  const [savingProfile, setSavingProfile] = createSignal(false)
  const [selectedProfile, setSelectedProfile] = createSignal('')
  const [jumpTarget, setJumpTarget] = createSignal<ReviewChangeLocation>()
  let scrollRef: HTMLDivElement | undefined
  let scrollFrame: number | undefined
  const sectionRefs = new Map<string, HTMLElement>()
  const state = createStoredConfig(
    readDiffReviewState.bind(null, props.projectSlug),
    saveDiffReviewState.bind(null, props.projectSlug),
    releaseDiffReviewState.bind(null, props.projectSlug),
  )
  const readAgentStatus = () => readReviewAgentStatus(props.projectSlug, props.ticket.folderName, props.ticket.agentWorktreeDir ?? null) // Publish completed background reads without suspending the composer on each poll.
  const agentState = createStoredState(readAgentStatus)
  const agentStatus = agentState.get

  async function refreshAgentStatus() {
    const result = await agentState.enqueueAndPublish(async () => success(await readAgentStatus()))
    if (result.type === 'Failure') errors.enqueueToast(result.error)
  }

  const worktreeIdentity = createMemo(() => agentStatus().worktreeIdentity)
  const reviewedLines = createMemo(() => {
    const tracker = createReviewedLineTracker({
      state,
      folderName: props.ticket.folderName,
      worktreeIdentity: worktreeIdentity(),
      onError: errors.enqueueToast,
    })
    onCleanup(() => void tracker.dispose())
    return tracker
  })
  const review = createMemo(() => getReviewSnapshot(props.projectSlug, props.ticket.folderName, scope() ?? null, props.ticket.agentWorktreeDir ?? null))
  const selectedAgentStatus = () => herdrStatus(ticketAgentKey(props.ticket.folderName, props.ticket, props.ticket.agentWorktreeDir))
  const sharedConfig = useContext(LauncherConfigContext)!
  const projectConfig = useContext(ProjectLauncherConfigContext)!
  const launcherConfig = createMemo(() => mergeLauncherConfigs(sharedConfig.get(), projectConfig.get()))
  const profileNames = () => launcherConfig()?.profiles.map((profile) => profile.name) ?? []
  createEffect(launcherConfig, (config) => {
    if (!config) return
    const names = config.profiles.map((profile) => profile.name)
    setSelectedProfile((current) => {
      if (names.includes(current)) return current
      const configured = config.columnDefaults[props.ticket.status]?.profileName
      return configured && names.includes(configured) ? configured : (names[0] ?? '')
    })
  })
  const scopes = () => review()?.scopes ?? [] // Before the user picks one, the selected Diff Scope is the one the server
  // opened the Diff Review with.
  const selectedScope = () => scope() ?? review()?.scope // Git's answer belongs to the Diff Scope it was calculated for, so an answer
  // for another scope never reaches the screen: while a newly selected scope
  // loads, the Diff Review shows its loading state instead of the files of the
  // scope the user just left. A scope Git cannot calculate answers with an
  // error, and the other scopes stay selectable.
  const scopeAnswer = createMemo(() => {
    const current = review()
    return current && current.scope === selectedScope() ? current : undefined
  })
  const scopeError = () => {
    const snapshot = scopeAnswer()?.snapshot
    return snapshot?.type === 'Failure' ? snapshot.error : undefined
  }
  const scopedSnapshot = () => {
    const snapshot = scopeAnswer()?.snapshot
    return snapshot?.type === 'Success' ? snapshot.value : undefined
  }
  const files = createMemo<ReviewFileSnapshot[]>((previous) => reuseUnchangedFiles(previous ?? [], scopedSnapshot()?.files ?? []), {
    loadingValue: [],
  })
  const snapshotFilePaths = createMemo<string[]>((previous) => reuseFilePaths(previous ?? [], files()), {
    loadingValue: [],
  })
  const fileTree = createMemo(() => buildDiffReviewFileTree(snapshotFilePaths()))
  const filePaths = createMemo(() => diffReviewFilePathsInTreeOrder(fileTree()))
  const fileByPath = createMemo(() => new Map(files().map((file) => [file.path, file])))
  const orderedFiles = createMemo(() => {
    const order = new Map(filePaths().map((filePath, index) => [filePath, index]))
    return [...files()].sort((left, right) => order.get(left.path)! - order.get(right.path)!)
  })
  const selection = () => composer()?.selection
  const selectionRangeForFile = (filePath: string) => {
    const selected = selection()
    return selected?.snapshot.filePath === filePath ? selected.range : undefined
  }

  function updateActivePathFromScroll() {
    scrollFrame = undefined
    const root = scrollRef
    const currentFiles = orderedFiles()
    if (!root || currentFiles.length === 0) return
    const rootTop = root.getBoundingClientRect().top
    let currentPath = currentFiles[0].path
    for (const file of currentFiles) {
      const section = sectionRefs.get(file.path)
      if (!section?.isConnected) continue
      if (section.getBoundingClientRect().top > rootTop + 16) break
      currentPath = file.path
    }
    if (root.scrollTop + root.clientHeight >= root.scrollHeight - 1) {
      currentPath = currentFiles.at(-1)!.path
    }
    setActivePath(currentPath)
  }

  function scheduleActivePathUpdate() {
    if (scrollFrame !== undefined) return
    scrollFrame = requestAnimationFrame(updateActivePathFromScroll)
  }

  function scrollToFile(filePath: string) {
    const section = sectionRefs.get(filePath)
    if (!section?.isConnected) return
    setActivePath(filePath)
    section.scrollIntoView({
      block: 'start',
    })
    scheduleActivePathUpdate()
  }

  createEffect(
    () => [scopedSnapshot(), activePath()] as const,
    ([current, currentPath]) => {
      if (!current) return
      if (!current.files.some((file) => file.path === currentPath)) {
        setActivePath(filePaths()[0] ?? '')
      }
      queueMicrotask(scheduleActivePathUpdate)
    },
  )
  createEffect(pace, (currentPace) => {
    if (currentPace !== 'live') return
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const scheduleNext = () => {
      if (disposed) return
      timer = setTimeout(() => {
        try {
          revalidate('diff-review-snapshot')
        } catch (error) {
          errors.enqueueToast(errorPayload(error, 'Review failed'))
        }
        scheduleNext()
      }, 1200)
    }
    scheduleNext()
    return () => {
      disposed = true
      if (timer !== undefined) clearTimeout(timer)
    }
  }) // The queue advances on the server as the Agent picks up and finishes each
  // Review Prompt, so the Diff Review rereads it while it is open.
  onSettled(() => {
    const timer = setInterval(() => {
      void state.refresh().then((result) => {
        if (result.type === 'Failure') errors.enqueueToast(result.error)
      })
      void refreshAgentStatus()
    }, 1200)
    return () => {
      clearInterval(timer)
      if (scrollFrame !== undefined) cancelAnimationFrame(scrollFrame)
      endTreeResize()
    }
  })
  const scopeLabel = () => {
    const selected = selectedScope()
    return selected ? SCOPE_LABELS[selected] : 'changes'
  }
  const unseenChanges = createMemo(() => unreviewedChangeCount(orderedFiles(), reviewedLines().reviewedLineIds()))
  const selectionStale = createMemo(() => {
    const selected = selection()
    if (!selected) return false
    const file = files().find((candidate) => candidate.path === selected.snapshot.filePath)
    return !reviewSelectionStillExists(file, selected.snapshot)
  })

  function changeComposer(next?: ActiveComposer) {
    setComposer(next)
    setFeedback('')
  } // The complete message the queue delivers to the Agent for the current

  // Composer: identical to what the server sends when the user hits Send.
  function completePromptText(): string {
    const selected = selection()
    return renderReviewPrompt(
      {
        feedback: feedback().trim(),
        snapshot: selected?.snapshot,
      },
      {
        stale: selectionStale(),
      },
    )
  } // The text every drag source hands to another window: identical to what the

  // queue delivers to the Agent for the same Review Selection.
  function promptDragText(): string | undefined {
    if (!selection()) return undefined
    return completePromptText()
  }

  function promptDragTextForFile(filePath: string): string | undefined {
    return selection()?.snapshot.filePath === filePath ? promptDragText() : undefined
  }

  function statusFor(file: ReviewFileSnapshot): FileReviewStatus {
    return fileIsReviewed(file, reviewedLines().reviewedLineIds()) ? 'reviewed' : 'unreviewed'
  }

  function onChangedLineVisible(filePath: string, lineId: string) {
    reviewedLines().markVisible({
      id: lineId,
      path: filePath,
    })
  }

  function selectLines(file: ReviewFileSnapshot, range: SelectedLineRange | null) {
    if (!range) {
      changeComposer()
      return
    }
    const current = scopedSnapshot()
    if (!current || file.binary) return
    try {
      setActivePath(file.path)
      changeComposer({
        selection: {
          range,
          snapshot: buildReviewPromptSnapshot(file, range, current.scope, current.revision),
        },
      })
      errors.clear()
    } catch (error) {
      errors.enqueueToast(errorPayload(error, 'Select review lines failed'))
    }
  }

  async function sendFeedback(feedback: string): Promise<boolean> {
    if (!composer() || sending()) return false
    setSending(true)
    errors.clear()
    try {
      const result = await enqueueReviewPrompt(
        props.projectSlug,
        props.ticket.folderName,
        feedback,
        selectedProfile() || null,
        selection()?.snapshot ?? null,
        worktreeIdentity(),
      )
      if (result.type === 'Failure') {
        errors.report(result.error)
        return false
      }
      setFeedback('')
      const refreshed = await state.refresh()
      if (refreshed.type === 'Failure') errors.enqueueToast(refreshed.error)
      void refreshAgentStatus()
      return true
    } catch (error) {
      errors.report(errorPayload(error, 'Send review prompt failed'))
      return false
    } finally {
      setSending(false)
    }
  }

  async function changeProfile(profileName: string) {
    if (savingProfile()) return
    setSelectedProfile(profileName)
    setSavingProfile(true)
    errors.clear()
    try {
      const column = props.ticket.status
      const result = await projectConfig.update((current) => ({
        ...current,
        columnDefaults: {
          ...current.columnDefaults,
          [column]: {
            templateName: null,
            checkedSkills: [],
            ...(current.columnDefaults && Object.hasOwn(current.columnDefaults, column) && current.columnDefaults[column]),
            profileName,
          },
        },
      }))
      if (result.type === 'Failure') {
        errors.report(result.error)
        return
      }
    } catch (error) {
      errors.report(errorPayload(error, 'Save review profile failed'))
    } finally {
      setSavingProfile(false)
    }
  }

  function jumpToNextChange() {
    const location = nextUnreviewedChange(orderedFiles(), reviewedLines().reviewedLineIds(), activePath())
    if (!location) return
    setActivePath(location.filePath)
    setJumpTarget(location)
  }

  async function refreshDiffSnapshot() {
    if (refreshing()) return
    setRefreshing(true)
    try {
      await revalidate('diff-review-snapshot')
    } finally {
      setRefreshing(false)
    }
  }

  let treeResizeState:
    | {
        startX: number
        startWidth: number
      }
    | undefined

  function onTreeResizePointerMove(event: PointerEvent) {
    if (!treeResizeState) return
    const next = treeResizeState.startWidth + (event.clientX - treeResizeState.startX)
    setTreeWidth(Math.min(Math.max(next, TREE_WIDTH_MIN), TREE_WIDTH_MAX))
  }

  function endTreeResize() {
    if (!treeResizeState) return
    treeResizeState = undefined
    document.body.style.removeProperty('cursor')
    document.body.style.removeProperty('user-select')
    window.removeEventListener('pointermove', onTreeResizePointerMove)
    window.removeEventListener('pointerup', endTreeResize)
    window.removeEventListener('pointercancel', endTreeResize)
  }

  function startTreeResize(event: PointerEvent) {
    event.preventDefault()
    treeResizeState = {
      startX: event.clientX,
      startWidth: treeWidth(),
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', onTreeResizePointerMove)
    window.addEventListener('pointerup', endTreeResize)
    window.addEventListener('pointercancel', endTreeResize)
  }

  function onTreeResizeKeyDown(event: KeyboardEvent) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const step = event.shiftKey ? 40 : 10
    setTreeWidth((current) => Math.min(Math.max(current + (event.key === 'ArrowRight' ? step : -step), TREE_WIDTH_MIN), TREE_WIDTH_MAX))
  }

  return (
    <div class="isolate flex h-full min-h-0 flex-col bg-background" data-testid="diff-review">
      <header class={'flex h-[54px] shrink-0 items-center justify-between gap-4' + ' border-b border-border bg-card/55 px-4'}>
        <div class="flex min-w-0 items-center gap-3">
          <GitCompareArrows size={18} class="shrink-0 text-primary" />
          <div class="min-w-0">
            <div class="truncate text-sm font-semibold">Diff Review · {props.ticket.number}</div>
            <div class="truncate font-mono text-[10px] text-muted-foreground">
              {props.projectName} · {props.ticket.title}
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Show when={ticketAgentWorktrees(props.ticket).filter((entry) => !entry.removed).length > 1}>
            <select
              aria-label="Review worktree"
              class="input input-sm max-w-[240px] text-xs"
              value={props.ticket.agentWorktreeDir}
              disabled={composer() !== undefined}
              onChange={(event) => props.onSelectWorktree(event.currentTarget.value)}
            >
              <For each={ticketAgentWorktrees(props.ticket).filter((entry) => !entry.removed)}>
                {(worktree) => <option value={worktree.worktreePath}>{worktree.branchName}</option>}
              </For>
            </select>
          </Show>
          <label class="relative">
            <span class="sr-only">Diff Scope</span>
            <select
              class="input input-sm w-[180px] appearance-none pr-8 text-xs"
              value={selectedScope() ?? ''}
              onChange={(event) => {
                const value = event.currentTarget.value
                if (isDiffScope(value)) setScope(value)
                changeComposer()
              }}
              data-testid="diff-review-scope"
            >
              <For each={scopes()}>{(value) => <option value={value}>{SCOPE_LABELS[value]}</option>}</For>
            </select>
            <ChevronDown size={13} class={'pointer-events-none absolute right-2.5 top-1/2' + ' -translate-y-1/2 text-muted-foreground'} />
          </label>
          <div class="flex rounded-md border border-input bg-background p-0.5">
            <button
              type="button"
              class={`h-7 rounded-sm px-2.5 font-mono text-[11px] ${pace() === 'live' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
              onClick={() => setPace('live')}
              aria-pressed={pace() === 'live' ? 'true' : 'false'}
              data-testid="diff-review-pace-live"
            >
              <Play size={11} class="mr-1 inline" />
              Live Review
            </button>
            <button
              type="button"
              class={`h-7 rounded-sm px-2.5 font-mono text-[11px] ${pace() === 'step-by-step' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
              onClick={() => setPace('step-by-step')}
              aria-pressed={pace() === 'step-by-step' ? 'true' : 'false'}
              data-testid="diff-review-pace-step"
            >
              <Pause size={11} class="mr-1 inline" />
              Step-by-Step
            </button>
          </div>
          <button
            type="button"
            class="btn-secondary btn-sm gap-1.5"
            disabled={unseenChanges() === 0}
            onClick={jumpToNextChange}
            title="Scroll to the next change you have not seen yet"
            data-testid="diff-review-next-change"
          >
            <ArrowDownToLine size={12} />
            Next Change
            <span class="font-mono text-[9px] text-muted-foreground">{unseenChanges()}</span>
          </button>
          <button
            type="button"
            class="btn-secondary btn-sm gap-1.5"
            onClick={() => {
              changeComposer({})
              errors.clear()
            }}
            title="Send the Agent a prompt without selecting lines"
            data-testid="diff-review-prompt-agent"
          >
            <Send size={12} />
            Prompt Agent
          </button>
          <span class="max-w-[120px] truncate font-mono text-[10px] text-muted-foreground" data-testid="diff-review-agent-status">
            {selectedAgentStatus() ?? 'no agent'}
          </span>
          <button
            type="button"
            class="btn-secondary btn-sm gap-1.5"
            disabled={refreshing()}
            onClick={() => void refreshDiffSnapshot()}
            data-testid="diff-review-refresh"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
          <div class="flex rounded-md border border-input bg-background p-0.5">
            <For each={['split', 'unified'] as const}>
              {(value) => (
                <button
                  type="button"
                  class={`h-7 rounded-sm px-2 font-mono text-[10px] ${layout() === value ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
                  onClick={() => setLayout(value)}
                  aria-pressed={layout() === value ? 'true' : 'false'}
                >
                  {value === 'split' ? 'Split' : 'Unified'}
                </button>
              )}
            </For>
          </div>
          <button
            type="button"
            class={`btn-secondary btn-sm gap-1.5 ${lineOverflow() === 'wrap' ? 'bg-accent text-accent-foreground' : ''}`}
            onClick={() => setLineOverflow((current) => (current === 'wrap' ? 'scroll' : 'wrap'))}
            aria-pressed={lineOverflow() === 'wrap' ? 'true' : 'false'}
            title="Wrap long lines instead of scrolling them sideways"
            data-testid="diff-review-wrap-lines"
          >
            <WrapText size={12} />
            Wrap Lines
          </button>
          <button
            type="button"
            class="btn-ghost-icon h-8 w-8"
            aria-label="Close Diff Review"
            onClick={props.onClose}
            data-testid="diff-review-close"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <Errored fallback={(error) => <DiffLoadError error={error()} onRetry={() => void revalidate('diff-review-snapshot')} />}>
        <Show
          when={scopedSnapshot()}
          fallback={
            <DiffScopeUnavailable error={scopeError()} label={scopeLabel()} onRetry={() => void revalidate('diff-review-snapshot')} />
          }
        >
          <Show
            when={files().length > 0}
            fallback={
              <div
                class="flex min-h-0 flex-1 flex-col items-center justify-center text-center"
                data-testid="diff-review-empty"
                data-loaded-scope={selectedScope()}
              >
                <Check size={28} class="mb-3 text-muted-foreground" />
                <p class="font-medium">No {scopeLabel().toLowerCase()}</p>
                <p class="mt-1 text-sm text-muted-foreground">Refresh to reread this Diff Scope from Git.</p>
              </div>
            }
          >
            <div class="flex min-h-0 flex-1">
              <FileTree
                files={files()}
                nodes={fileTree()}
                loadedScope={selectedScope()}
                activePath={activePath()}
                width={treeWidth()}
                statusFor={statusFor}
                onSelect={scrollToFile}
              />
              <div
                class="w-1.5 shrink-0 cursor-col-resize hover:bg-border/40 active:bg-border/60"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize changed files panel"
                aria-valuemin={TREE_WIDTH_MIN}
                aria-valuemax={TREE_WIDTH_MAX}
                aria-valuenow={treeWidth()}
                tabindex={0}
                onPointerDown={startTreeResize}
                onKeyDown={onTreeResizeKeyDown}
                data-testid="diff-review-tree-resize"
              />
              <div
                ref={scrollRef}
                class="min-h-0 min-w-0 flex-1 overflow-auto p-4"
                onScroll={scheduleActivePathUpdate}
                data-testid="diff-review-scroll"
              >
                <div class="space-y-8">
                  <For each={filePaths()}>
                    {(filePath) => (
                      <Show when={fileByPath().get(filePath)}>
                        {(file) => (
                          <section
                            ref={(element) => sectionRefs.set(filePath, element)}
                            class="scroll-mt-4"
                            data-testid="diff-review-file-section"
                            data-file-path={filePath}
                          >
                            <div class={'flex items-center justify-between rounded-t-md border' + ' border-border bg-card px-3 py-2'}>
                              <div class="min-w-0">
                                <div class="truncate font-mono text-xs font-semibold">{file().path}</div>
                                <div class="mt-1 text-[10px] text-muted-foreground">
                                  {file().changeType} · {formatBytes(file().byteSize)}
                                </div>
                              </div>
                              <ReviewStateIcon status={statusFor(file())} />
                            </div>
                            <Show
                              when={!file().binary}
                              fallback={
                                <div
                                  class={'rounded-b-md border border-t-0 border-border' + ' bg-card p-8 text-center'}
                                  data-testid="diff-review-binary"
                                  data-file-path={filePath}
                                >
                                  <FileWarning size={24} class="mx-auto text-warning" />
                                  <p class="mt-3 font-medium">Binary file</p>
                                  <p class="mt-1 text-sm text-muted-foreground">Line review is unavailable for this file.</p>
                                </div>
                              }
                            >
                              <Show
                                when={file().hunks.length > 0}
                                fallback={
                                  <div class={'rounded-b-md border border-t-0' + ' border-border' + ' bg-card p-8 text-center'}>
                                    This file changed without a text-content diff.
                                  </div>
                                }
                              >
                                <DiffSurface
                                  file={file()}
                                  layout={layout()}
                                  lineOverflow={lineOverflow()}
                                  selection={selectionRangeForFile(filePath)}
                                  jumpTarget={jumpTarget()}
                                  scrollRoot={() => scrollRef}
                                  onSelect={(range) => selectLines(file(), range)}
                                  onJumpApplied={() => setJumpTarget()}
                                  onChangedLineVisible={(lineId) => onChangedLineVisible(filePath, lineId)}
                                  onError={errors.enqueueToast}
                                  dragText={() => promptDragTextForFile(filePath)}
                                />
                              </Show>
                            </Show>
                          </section>
                        )}
                      </Show>
                    )}
                  </For>
                </div>
              </div>
            </div>
          </Show>
        </Show>
      </Errored>

      <ReviewAgentStatusContext
        value={{
          get: agentStatus,
          refresh: refreshAgentStatus,
        }}
      >
        <ReviewPromptComposer
          open={composer() !== undefined}
          selection={selection()}
          stale={selectionStale()}
          feedback={feedback()}
          completePrompt={completePromptText()}
          dragText={promptDragText()}
          profileNames={profileNames()}
          selectedProfile={selectedProfile()}
          savingProfile={savingProfile()}
          onFeedbackChange={setFeedback}
          onProfileChange={(profileName) => void changeProfile(profileName)}
          sending={sending()}
          herdrStatus={selectedAgentStatus()}
          onCancel={() => {
            changeComposer()
            errors.clear()
          }}
          onError={errors.report}
          onSend={sendFeedback}
        >
          <DiffReviewContext value={state}>
            <ReviewPromptQueueList projectSlug={props.projectSlug} folderName={props.ticket.folderName} profileName={selectedProfile()} />
          </DiffReviewContext>
        </ReviewPromptComposer>
      </ReviewAgentStatusContext>
    </div>
  )
}
