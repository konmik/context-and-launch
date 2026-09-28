import type { JSX } from '@solidjs/web'
import { Show, For } from 'solid-js'
import { DragDropProvider } from '~/components/drag/DragDropProvider.js'
import { DialogRoot } from '../ui/DialogRoot.js'
import { DialogTitle } from '../ui/DialogTitle.js'
import type { MergedLauncherConfig, LauncherColumnDefaults } from '~/core/launcher/launcher-config.js'
import { NameDragOverlay } from '../board/NameDragOverlay.js'
import type { AgentLauncherController } from './agent-launcher-controller.js'
import { NamedEntrySelect } from './NamedEntrySelect.js'
import { LauncherSkillDropPreview } from './LauncherSkillDropPreview.js'
import { SortableLauncherSkill } from './SortableLauncherSkill.js'

interface AgentLauncherProps {
  config: MergedLauncherConfig | null
  onDefaultsChange: (patch: Partial<LauncherColumnDefaults>) => void
  ctrl: AgentLauncherController
}

export default function AgentLauncher(props: AgentLauncherProps): JSX.Element {
  const c = props.ctrl
  return (
    <div class="flex h-full flex-col gap-4 overflow-auto px-4 pb-4">
      <Show when={props.config} fallback={<p class="text-sm text-muted-foreground">Loading config...</p>}>
        {(cfg) => (
          <div class="flex w-full flex-col gap-4">
            <div class="flex flex-col gap-4">
              <NamedEntrySelect
                label="Agent"
                value={c.selectedProfile()}
                options={cfg().profiles}
                testId="task-detail-launcher-profile-select"
                onChange={(name) => {
                  c.setSelectedProfile(name)
                  props.onDefaultsChange({
                    profileName: name,
                  })
                }}
              />
              <NamedEntrySelect
                label="Prompt Template"
                value={c.selectedTemplate()}
                options={cfg().templates}
                testId="task-detail-launcher-template-select"
                onChange={(name) => {
                  c.setSelectedTemplate(name)
                  props.onDefaultsChange({
                    templateName: name,
                  })
                }}
              />
              <Show when={cfg().skills.length > 0}>
                <div>
                  <label class="field-label">Skills</label>
                  <DragDropProvider
                    onDragStart={c.skillReorder.onDragStart}
                    onDragOver={c.skillReorder.onDragOver}
                    onDragEnd={c.skillReorder.onDragEnd}
                  >
                    <div class="flex flex-col gap-1 pl-2">
                      <For each={c.orderedSkills()}>
                        {(skill, i) => (
                          <>
                            <Show when={c.skillReorder.dropPreview()?.insertBefore === i()}>
                              <LauncherSkillDropPreview skill={c.skillReorder.dropPreview()!.item} />
                            </Show>
                            <SortableLauncherSkill
                              skill={skill}
                              checked={c.checkedSkills().has(skill.name)}
                              isActive={c.skillReorder.activeId() === skill.name}
                              onToggle={() => c.toggleSkill(skill.name)}
                            />
                          </>
                        )}
                      </For>
                      <Show when={c.skillReorder.dropPreview()?.insertBefore === c.orderedSkills().length}>
                        <LauncherSkillDropPreview skill={c.skillReorder.dropPreview()!.item} />
                      </Show>
                    </div>
                    <NameDragOverlay nameOf={(id) => c.orderedSkills().find((s) => s.name === id)?.name} />
                  </DragDropProvider>
                </div>
              </Show>
            </div>
          </div>
        )}
      </Show>

      <DialogRoot open={!!c.behindRemoteMsg()} onOpenChange={() => c.setBehindRemoteMsg('')} class="max-w-sm">
        <DialogTitle class="sr-only">Behind Remote</DialogTitle>
        <p class="mb-4 text-sm">{c.behindRemoteMsg()}</p>
        <div class="flex justify-end gap-2">
          <button onClick={() => c.setBehindRemoteMsg('')} class="btn-secondary" data-testid="task-detail-launcher-behind-remote-cancel">
            Cancel
          </button>
          <button
            onClick={() => {
              c.setBehindRemoteMsg('')
              c.launchAgent({
                skipBehindRemote: true,
              })
            }}
            disabled={c.launching()}
            class="btn-primary"
            data-testid="task-detail-launcher-behind-remote-proceed"
          >
            Proceed
          </button>
        </div>
      </DialogRoot>

      <DialogRoot open={!!c.dirtyWorktreeMsg()} onOpenChange={() => c.setDirtyWorktreeMsg('')} class="max-w-sm">
        <DialogTitle class="sr-only">Uncommitted Changes</DialogTitle>
        <p class="mb-4 text-sm">{c.dirtyWorktreeMsg()}</p>
        <div class="flex justify-end gap-2">
          <button onClick={() => c.setDirtyWorktreeMsg('')} class="btn-secondary" data-testid="task-detail-launcher-dirty-cancel">
            Cancel
          </button>
          <button
            onClick={() => {
              c.setDirtyWorktreeMsg('')
              c.launchAgent({
                force: true,
              })
            }}
            disabled={c.launching()}
            class="btn-primary"
            data-testid="task-detail-launcher-dirty-launch-anyway"
          >
            Launch Anyway
          </button>
        </div>
      </DialogRoot>
    </div>
  )
}
