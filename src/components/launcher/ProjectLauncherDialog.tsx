import type { JSX } from '@solidjs/web'
import { createMemo, useContext, untrack } from 'solid-js'
import { LauncherConfigContext } from './shared-launcher-config-storage.js'
import { mergeLauncherConfigs } from '~/core/launcher/launcher-config-data.js'
import { X } from '~/components/ui/icons/X.js'
import { FloatingWindow } from '../ui/FloatingWindow.js'
import { FloatingWindowHeader } from '../ui/FloatingWindowHeader.js'
import { FloatingPanelBody } from '../ui/FloatingPanelBody.js'
import { FloatingPanelCloseTrigger } from '../ui/FloatingPanelCloseTrigger.js'
import { FloatingPanelTitle } from '../ui/FloatingPanelTitle.js'
import { FLOATING_WINDOW_MIN_SIZE, tallWindowDefaultSize } from '../ui/floating-window.js'
import { LauncherTab } from '../ticket/ticket-detail-launcher-tab.js'
import { createAgentLauncherController } from './agent-launcher-controller.js'
import { getProjectLauncherMetadata, launchProjectAgentAction } from './launcher-api.js'
import { PROJECT_LAUNCH_KEY } from '~/core/launcher/launch-keys.js'
import { errorPayload } from '~/core/shared/errors.js'
import type { LauncherColumnDefaults } from '~/core/launcher/launcher-config.js'
import { useErrorReporter } from '../shared/error-presentation.js'
import { ProjectLauncherConfigContext } from './project-launcher-config-storage.js'

export default function ProjectLauncherDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectSlug: string
}): JSX.Element {
  const sharedConfig = useContext(LauncherConfigContext)!
  const projectConfig = useContext(ProjectLauncherConfigContext)!
  const metadata = createMemo(() => (props.open ? getProjectLauncherMetadata(props.projectSlug) : null), {
    loadingValue: null,
  })
  const config = createMemo(() => {
    const project = metadata()
    return (
      project && {
        ...project,
        ...mergeLauncherConfigs(sharedConfig.get(), projectConfig.get()),
      }
    )
  })
  const errors = useErrorReporter(() => props.open)

  function patchDefaults(patch: Partial<LauncherColumnDefaults>) {
    projectConfig
      .update((current) => ({
        ...current,
        columnDefaults: {
          ...current.columnDefaults,
          [PROJECT_LAUNCH_KEY]: {
            templateName: null,
            checkedSkills: [],
            profileName: null,
            ...current.columnDefaults?.[PROJECT_LAUNCH_KEY],
            ...patch,
          },
        },
      }))
      .then((result) => {
        if (result.type === 'Failure') {
          errors.enqueueToast(result.error)
          return
        }
      })
      .catch((e) => errors.enqueueToast(errorPayload(e, 'Save failed')))
  }

  const ctrl = untrack(() =>
    createAgentLauncherController({
      onError: errors.report,
      projectSlug: props.projectSlug,
      get config() {
        return config()
      },
      onDefaultsChange: patchDefaults,
      useWorktree: false,
      get projectPath() {
        return config()?.projectPath ?? ''
      },
      worktreeDir: '',
      launchDir: () => config()?.projectPath ?? '',
      launch: (args) => launchProjectAgentAction(props.projectSlug, args),
    }),
  )

  async function run() {
    await ctrl.launchAgent()
    if (!ctrl.errorInfo()) props.onOpenChange(false)
  }

  return (
    <>
      <FloatingWindow
        open={props.open}
        onOpenChange={(d) => {
          if (!d.open) props.onOpenChange(false)
        }}
        defaultSize={tallWindowDefaultSize()}
        minSize={FLOATING_WINDOW_MIN_SIZE}
        persistRect
      >
        <FloatingWindowHeader
          title={<FloatingPanelTitle>Launch an agent</FloatingPanelTitle>}
          actions={
            <FloatingPanelCloseTrigger aria-label="Close">
              <X size={16} />
            </FloatingPanelCloseTrigger>
          }
        />
        <FloatingPanelBody>
          <LauncherTab config={config()} onDefaultsChange={patchDefaults} ctrl={ctrl} />
          <div class="flex items-end gap-2 border-t border-border px-4 py-3">
            <div class="min-w-0 flex-1" data-testid="project-launcher-dir-display">
              <span class="block text-xs text-muted-foreground">Launch directory</span>
              <span
                class="block truncate text-xs text-muted-foreground"
                dir="rtl"
                style={{
                  'text-align': 'left',
                }}
              >
                {config()?.projectPath ?? ''}
              </span>
            </div>
            <button
              type="button"
              onClick={run}
              disabled={ctrl.launching() || !config()}
              class="btn-primary"
              data-testid="project-launcher-run-button"
            >
              Launch
            </button>
            <button
              type="button"
              onClick={() => props.onOpenChange(false)}
              class="btn-secondary"
              data-testid="project-launcher-close-button"
            >
              Close
            </button>
          </div>
        </FloatingPanelBody>
      </FloatingWindow>

    </>
  )
}
