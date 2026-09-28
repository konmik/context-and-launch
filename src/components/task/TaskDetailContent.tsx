import type { JSX } from '@solidjs/web'
import { Show, untrack, useContext } from 'solid-js'
import { X } from '~/components/ui/icons/X.js'
import { Copy } from '~/components/ui/icons/Copy.js'
import { FloatingWindow } from '../ui/FloatingWindow.js'
import { FloatingWindowHeader } from '../ui/FloatingWindowHeader.js'
import { FloatingPanelBody } from '../ui/FloatingPanelBody.js'
import { FLOATING_WINDOW_MIN_SIZE, tallWindowDefaultSize } from '../ui/floating-window.js'
import { TabsRoot } from '../ui/TabsRoot.js'
import { TabsList } from '../ui/TabsList.js'
import { TabsTrigger } from '../ui/TabsTrigger.js'
import TaskDetailActions from './TaskDetailActions'
import type { TaskInfo } from '~/core/task/task-store.js'
import { useModEnterSubmit, modEnterHint } from '~/lib/use-mod-enter-submit'
import { DiscardConfirmation } from './DiscardConfirmation.js'
import { NewFileDialog } from './NewFileDialog.js'
import { DeleteFileDialog } from './DeleteFileDialog.js'
import { ConfirmUploadDialog } from './ConfirmUploadDialog.js'
import { ExternalChangeDialog } from './ExternalChangeDialog.js'
import { activeFileLabel } from './task-detail-pure.js'
import { EditorTab } from './task-detail-editor-tab.js'
import { LauncherTab } from './task-detail-launcher-tab.js'
import { createAgentLauncherController } from '../launcher/agent-launcher-controller.js'
import { launchAgentAction } from '../launcher/launcher-api.js'
import { createTaskDetailState, type TaskDetailStateDeps } from './task-detail-state.js'
import { ErrorField } from '../shared/ErrorField.js'
import { useErrorReporter } from '../shared/error-presentation.js'
import { TaskStatusContext } from './task-status-storage.js'
import { TaskWorktrees } from './TaskWorktrees.js'

export function TaskDetailContent(props: {
  onClose: () => void
  onArchive?: (task: TaskInfo) => void
  onDelete?: (task: TaskInfo) => void
  projectSlug: string
  onReviewChanges?: (task: TaskInfo) => void
  stateDeps?: Partial<TaskDetailStateDeps>
  launchAgent?: typeof launchAgentAction
}): JSX.Element {
  const errors = useErrorReporter()
  const s = untrack(() =>
    createTaskDetailState(props, {
      ...props.stateDeps,
      onError: errors.report,
      onClearError: errors.clear,
      onBackgroundError: errors.enqueueToast,
    }),
  )
  const taskStatus = useContext(TaskStatusContext)!
  const task = taskStatus.get
  const launcherDeps = untrack(() => ({
    onError: errors.report,
    projectSlug: props.projectSlug,
    task,
    get config() {
      return s.launcherConfig()
    },
    onDefaultsChange: s.patchColumnDefaults,
    get useWorktree() {
      return task().useWorktree
    },
    get projectPath() {
      return s.launcherConfig()?.projectPath ?? ''
    },
    get worktreeDir() {
      return s.launcherConfig()?.worktreeDir ?? ''
    },
    launchDir: s.launchDir,
    launch: (args: Parameters<typeof launchAgentAction>[2]) =>
      (props.launchAgent ?? launchAgentAction)(props.projectSlug, task().folderName, args),
  }))
  const launcherCtrl = untrack(() => createAgentLauncherController(launcherDeps))
  useModEnterSubmit({
    onSubmit: s.submitNewFile,
    disabled: () => !s.newFileName().trim(),
    active: () => s.newFileDialogOpen(),
  })
  useModEnterSubmit({
    onSubmit: s.deleteOrRemoveFile,
    disabled: () => false,
    active: () => s.confirmingDelete(),
  })
  useModEnterSubmit({
    onSubmit: s.saveAll,
    disabled: () => s.saving() || !s.hasAnyUnsavedChanges(),
    active: () => !s.newFileDialogOpen() && !s.confirmingDelete() && !s.confirmingFileSwitch() && !s.confirmingClose(),
  })
  return (
    <>
      <FloatingWindow
        open={true}
        onOpenChange={(d) => {
          if (!d.open) s.close()
        }}
        defaultSize={tallWindowDefaultSize()}
        minSize={FLOATING_WINDOW_MIN_SIZE}
        persistRect
      >
        <FloatingWindowHeader
          title={
            <>
              <div class="flex shrink-0 flex-col">
                <input
                  type="text"
                  data-testid="task-detail-number-input"
                  value={s.editedNumber()}
                  onInput={(e) => s.setEditedNumber(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      s.setEditedNumber(task().number)
                      e.currentTarget.blur()
                    }
                  }}
                  class="shrink-0 bg-transparent outline-none focus:border-b focus:border-accent-foreground"
                  style={{
                    'field-sizing': 'content',
                  }}
                />
                <ErrorField field="number" />
              </div>
              <span class="shrink-0">-</span>
              <div class="flex min-w-0 flex-1 flex-col">
                <input
                  type="text"
                  data-testid="task-detail-title-input"
                  value={s.editedTitle()}
                  onInput={(e) => s.setEditedTitle(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      s.setEditedTitle(task().title)
                      e.currentTarget.blur()
                    }
                  }}
                  class="min-w-0 flex-1 bg-transparent outline-none focus:border-b focus:border-accent-foreground"
                />
                <ErrorField field="title" />
              </div>
            </>
          }
          actions={
            <div class="flex items-center gap-1">
              <TaskDetailActions
                projectSlug={props.projectSlug}
                task={task()}
                shortcuts={s.launcherConfig()?.shortcuts ?? []}
                launchDir={s.launchDir()}
                hasUnsavedChanges={s.hasAnyUnsavedChanges()}
                onArchive={props.onArchive}
                onDelete={props.onDelete}
                onReviewChanges={props.onReviewChanges}
              />
              <button
                type="button"
                data-testid="task-detail-close-window-button"
                aria-label="Close Window"
                onClick={() => s.close()}
                class="btn-ghost-icon h-8 w-8"
              >
                <X size={16} />
              </button>
            </div>
          }
        >
          <Show when={s.initialTabResolved()}>
            <div class="-mx-4 -mb-4">
              <TabsRoot
                value={s.activeTab()}
                onValueChange={(d) => {
                  if (d.value === 'editor' || d.value === 'launcher') s.switchTab(d.value)
                }}
              >
                <TabsList>
                  <TabsTrigger value="editor" data-testid="task-detail-tab-editor">
                    File Editor
                  </TabsTrigger>
                  <TabsTrigger value="launcher" data-testid="task-detail-tab-launcher">
                    Agent Launcher
                  </TabsTrigger>
                </TabsList>
              </TabsRoot>
            </div>
          </Show>
        </FloatingWindowHeader>

        <FloatingPanelBody>
          <Show
            when={s.initialTabResolved()}
            fallback={
              <div class="flex h-full items-center justify-center text-sm text-muted-foreground" data-testid="task-detail-loading">
                Loading task...
              </div>
            }
          >
            <div class="flex h-full flex-col">
              <Show when={s.activeTab() === 'editor'}>
                <EditorTab ctrl={s} />
              </Show>
              <Show when={s.activeTab() === 'launcher'}>
                <LauncherTab config={launcherDeps.config} onDefaultsChange={launcherDeps.onDefaultsChange} ctrl={launcherCtrl} />
              </Show>
              <div class="border-t border-border px-4 py-3">
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    class="btn-icon shrink-0 !h-6 !w-6"
                    data-testid="launch-dir-copy-button"
                    onClick={() => {
                      try {
                        navigator.clipboard.writeText(s.launchDir()).catch((err) => {
                          console.warn('Failed to copy launch dir:', err)
                        })
                      } catch (err) {
                        console.warn('Clipboard API unavailable:', err)
                      }
                    }}
                    title="Copy path"
                  >
                    <Copy size={12} />
                  </button>
                  <div class="mr-6 min-w-0 flex-1" data-testid="launch-dir-display" title={s.launchDir()}>
                    <TaskWorktrees projectSlug={props.projectSlug} />
                  </div>
                  <Show when={s.activeTab() === 'launcher'}>
                    <button
                      type="button"
                      onClick={() => launcherCtrl.launchAgent()}
                      disabled={launcherCtrl.launching()}
                      class="btn-primary"
                      data-testid="task-detail-launcher-run-button"
                    >
                      Launch
                    </button>
                  </Show>
                  <Show when={s.showSaveButton() || s.hasUnsavedHeaderChanges()}>
                    <button
                      type="button"
                      onClick={s.saveAll}
                      disabled={s.saving() || !s.hasAnyUnsavedChanges()}
                      title={modEnterHint()}
                      class="btn-primary"
                      data-testid="task-detail-save-button"
                    >
                      Save
                    </button>
                  </Show>
                  <button type="button" onClick={s.close} class="btn-secondary" data-testid="task-detail-close-button">
                    Close
                  </button>
                </div>
              </div>
            </div>
          </Show>
        </FloatingPanelBody>
      </FloatingWindow>

      <DiscardConfirmation
        open={s.confirmingClose()}
        message="You have unsaved changes. Discard them?"
        onCancel={() => s.setConfirmingClose(false)}
        onDiscard={s.forceClose}
      />

      <DiscardConfirmation
        open={s.confirmingFileSwitch()}
        message="You have unsaved changes. Discard them and switch files?"
        onCancel={s.cancelFileSwitch}
        onDiscard={s.proceedFileSwitch}
      />

      <ExternalChangeDialog
        open={s.confirmingExternalChange()}
        label={activeFileLabel(s.activeFile())}
        onOverwrite={s.overwriteExternalChange}
        onDiscard={s.discardExternalChange}
      />

      <NewFileDialog
        open={s.newFileDialogOpen()}
        name={s.newFileName()}
        setName={s.setNewFileName}
        onSubmit={s.submitNewFile}
        onClose={() => s.setNewFileDialogOpen(false)}
      />

      <DeleteFileDialog
        open={s.confirmingDelete()}
        label={activeFileLabel(s.activeFile())}
        onDelete={s.deleteOrRemoveFile}
        onClose={() => s.setConfirmingDelete(false)}
      />

      <ConfirmUploadDialog
        open={!!s.confirmOverwrite()}
        title="Overwrite File"
        description={`A file named "${s.confirmOverwrite()?.fileName}" already exists. Overwrite it?`}
        confirmLabel="Overwrite"
        confirmClass="btn-destructive"
        onCancel={s.cancelOverwriteConfirm}
        onConfirm={s.confirmOverwriteAndUpload}
      />

      <ConfirmUploadDialog
        open={!!s.confirmSize()}
        title="Large File"
        description={
          `"${s.confirmSize()?.fileName}" is ` +
          `${((s.confirmSize()?.size ?? 0) / 1024).toFixed(1)} KB, ` +
          'which is larger than 10 KB. Copy it anyway?'
        }
        confirmLabel="Copy Anyway"
        confirmClass="btn-primary"
        onCancel={s.cancelSizeConfirm}
        onConfirm={s.confirmSizeAndUpload}
      />
    </>
  )
}
