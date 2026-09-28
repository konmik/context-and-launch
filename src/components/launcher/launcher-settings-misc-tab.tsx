import type { JSX } from '@solidjs/web'
import type { Result } from '~/util/result.js'
import { createSignal, createMemo, createEffect, useContext } from 'solid-js'
import { revalidate, useAction } from '@solidjs/router'
import { TabsContent } from '../ui/TabsContent.js'
import { ScopeBadge } from './ScopeBadge.js'
import DeleteProjectDialog from '../project/DeleteProjectDialog.js'
import { useErrorReporter } from '../shared/error-presentation.js'
import { ErrorField } from '../shared/ErrorField.js'
import { errorPayload, type ErrorInfo } from '~/core/shared/errors.js'
import { SettingsFolderField } from './settings-folder-field.js'
import { AppConfigContext } from '../config/app-config-storage.js'
import { LauncherConfigContext } from './shared-launcher-config-storage.js'
import { ProjectLauncherConfigContext } from './project-launcher-config-storage.js'
import { getProjectLauncherMetadata } from './launcher-api.js'
import { mergeLauncherConfigs } from '~/core/launcher/launcher-config-data.js'
import { setProjectPath as setProjectPathAction, setTasksLocation } from '../project/project-api.js'

export function MiscTab(props: {
  open: boolean
  projectSlug: string
  onDeleteProject?: (projectSlug: string) => Promise<Result<undefined, ErrorInfo>>
}): JSX.Element {
  const appConfig = useContext(AppConfigContext)!
  const sharedConfig = useContext(LauncherConfigContext)!
  const projectConfig = useContext(ProjectLauncherConfigContext)!
  const metadata = createMemo(() => getProjectLauncherMetadata(props.projectSlug))
  const config = createMemo(() => mergeLauncherConfigs(sharedConfig.get(), projectConfig.get()))
  const errors = useErrorReporter(() => props.open)
  const [deleteOpen, setDeleteOpen] = createSignal(false)
  const [nameDraft, setProjectName] = createSignal<string>()
  const [pathDraft, setProjectPath] = createSignal<string>()
  const [tasksPathDraft, setTasksPath] = createSignal<string>()
  const [tasksBranchDraft, setTasksBranch] = createSignal<string>()
  const [worktreeDraft, setWorktreeRootPath] = createSignal<string>()
  const [branchDraft, setBranchPrefix] = createSignal<string>()
  const [promptDraft, setConflictPrompt] = createSignal<string>()
  const projectName = () => nameDraft() ?? appConfig.get().projects.find((p) => p.projectSlug === props.projectSlug)?.name ?? ''
  const projectPath = () => pathDraft() ?? metadata().projectPath
  const tasksPath = () => tasksPathDraft() ?? metadata().worktreeDir
  const tasksBranch = () => tasksBranchDraft() ?? metadata().tasksBranch ?? ''
  const worktreeRootPath = () => worktreeDraft() ?? config().worktreeRootPath ?? ''
  const branchPrefix = () => branchDraft() ?? config().branchPrefix ?? ''
  const conflictPrompt = () => promptDraft() ?? config().conflictResolutionPrompt
  const [savingProjectPath, setSavingProjectPath] = createSignal(false)
  const [savingTasksLocation, setSavingTasksLocation] = createSignal(false)
  const runSetProjectPath = useAction(setProjectPathAction)
  const runSetTasksLocation = useAction(setTasksLocation)
  createEffect(
    () => props.open,
    (open) => {
      if (!open) return
      setProjectName()
      setProjectPath()
      setTasksPath()
      setTasksBranch()
      setWorktreeRootPath()
      setBranchPrefix()
      setConflictPrompt()
      errors.clear()
    },
  )

  async function saveProjectName() {
    errors.clear()
    const name = projectName().trim() || undefined
    const result = await appConfig.update((current) => ({
      ...current,
      projects: current.projects.map((project) =>
        project.projectSlug === props.projectSlug
          ? {
              ...project,
              name,
            }
          : project,
      ),
    }))
    if (result.type === 'Failure') errors.report(result.error)
  }

  async function saveOverride(key: 'worktreeRootPath' | 'branchPrefix' | 'conflictResolutionPrompt', value: string) {
    errors.clear()
    const result = await projectConfig.update((current) => ({
      ...current,
      [key]: value.trim() || undefined,
    }))
    if (result.type === 'Failure') errors.report(result.error)
  }

  async function saveProjectPath(path = projectPath()) {
    if (savingProjectPath() || path.trim() === metadata().projectPath) return
    setSavingProjectPath(true)
    errors.clear()
    try {
      const result = await runSetProjectPath(props.projectSlug, path)
      if (result.type === 'Failure') {
        errors.report(result.error)
        return
      }
      setProjectPath(result.value.path)
      await revalidate(['launcher-metadata', 'project-page', 'project-sync-status'])
    } catch (e) {
      errors.report(errorPayload(e, 'Save failed'))
    } finally {
      setSavingProjectPath(false)
    }
  }

  async function saveTasksLocation(kind: 'path' | 'branch', value: string) {
    const saved = kind === 'path' ? metadata().worktreeDir : (metadata().tasksBranch ?? '')
    if (savingTasksLocation() || value.trim() === saved) return
    setSavingTasksLocation(true)
    errors.clear()
    try {
      const result = await runSetTasksLocation(props.projectSlug, {
        kind,
        value,
      })
      if (result.type === 'Failure') {
        errors.report(result.error)
        return
      }
      if (kind === 'path') setTasksPath(result.value.value)
      else setTasksBranch(result.value.value)
      await revalidate('launcher-metadata')
    } catch (e) {
      errors.report(errorPayload(e, 'Save failed'))
    } finally {
      setSavingTasksLocation(false)
    }
  }

  return (
    <>
      <TabsContent value="misc">
        <div class="space-y-6">
          <section>
            <label class="field-label">
              Project name <ScopeBadge scope="project" />
            </label>
            <input
              type="text"
              value={projectName()}
              onInput={(e) => setProjectName(e.currentTarget.value)}
              onBlur={saveProjectName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveProjectName()
              }}
              class="input input-sm"
              data-testid="launcher-settings-misc-project-name-input"
            />
          </section>
          <SettingsFolderField
            label="Project repo folder"
            field="path"
            testId="launcher-settings-misc-project-path"
            value={projectPath()}
            onValueChange={setProjectPath}
            onSaveRequested={saveProjectPath}
            saving={savingProjectPath()}
          />
          <SettingsFolderField
            label="Tasks folder"
            field="tasksPath"
            testId="launcher-settings-misc-tasks-path"
            value={tasksPath()}
            onValueChange={setTasksPath}
            onSaveRequested={(path = tasksPath()) => saveTasksLocation('path', path)}
            saving={savingTasksLocation()}
          />
          <section>
            <label class="field-label" for="tasks-branch">
              Tasks branch <ScopeBadge scope="project" />
            </label>
            <input
              id="tasks-branch"
              type="text"
              value={tasksBranch()}
              onInput={(e) => setTasksBranch(e.currentTarget.value)}
              onBlur={() => saveTasksLocation('branch', tasksBranch())}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveTasksLocation('branch', tasksBranch())
              }}
              disabled={savingTasksLocation()}
              class="input input-sm"
              data-testid="launcher-settings-misc-tasks-branch-input"
            />
            <ErrorField field="branch" />
          </section>
          <SettingsFolderField
            label="Agent worktree root path"
            field="worktreeRootPath"
            testId="launcher-settings-misc-worktree"
            value={worktreeRootPath()}
            onValueChange={setWorktreeRootPath}
            saving={false}
            onSaveRequested={(path = worktreeRootPath()) => saveOverride('worktreeRootPath', path)}
          />
          <section>
            <label class="field-label">
              Branch prefix <ScopeBadge scope="project" />
            </label>
            <input
              type="text"
              value={branchPrefix()}
              onInput={(e) => setBranchPrefix(e.currentTarget.value)}
              onBlur={() => saveOverride('branchPrefix', branchPrefix())}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveOverride('branchPrefix', branchPrefix())
              }}
              class="input input-sm"
              placeholder="No prefix"
              data-testid="launcher-settings-misc-branch-prefix-input"
            />
          </section>
          <section>
            <label class="field-label">
              Conflict resolution prompt <ScopeBadge scope="project" />
            </label>
            <textarea
              value={conflictPrompt()}
              onInput={(e) => setConflictPrompt(e.currentTarget.value)}
              onBlur={() => saveOverride('conflictResolutionPrompt', conflictPrompt())}
              class="input min-h-[80px]"
              placeholder="Prompt for resolving merge conflicts..."
              data-testid="launcher-settings-misc-conflict-prompt"
            />
          </section>
          {props.onDeleteProject && (
            <section class="border-t border-border pt-6">
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                class="btn-destructive"
                data-testid="launcher-settings-delete-project"
              >
                Delete project
              </button>
              <DeleteProjectDialog
                open={deleteOpen()}
                onOpenChange={setDeleteOpen}
                projectSlug={props.projectSlug}
                onSubmit={props.onDeleteProject}
              />
            </section>
          )}
        </div>
      </TabsContent>
    </>
  )
}
