import { Show, createEffect, createSignal, useContext } from 'solid-js'
import type { JSX } from '@solidjs/web'
import { DialogRoot } from '../ui/DialogRoot.js'
import { DialogForm } from '../ui/DialogForm.js'
import { modEnterHint, useModEnterSubmit } from '~/lib/use-mod-enter-submit'
import { itemCollections, usesWindowsBatchCommand } from './launcher-settings-pure.js'
import { ErrorField } from '../shared/ErrorField.js'
import { useErrorReporter } from '../shared/error-presentation.js'
import { createValidationError, createNotFoundError, errorPayload } from '~/core/shared/errors.js'
import { LauncherConfigContext } from './shared-launcher-config-storage.js'
import { ProjectLauncherConfigContext } from './project-launcher-config-storage.js'
import { updateLauncherReferences } from '~/core/launcher/launcher-config-data.js'
import { type ItemFormDialogProps } from './launcher-settings-form-types.js'
import { type ItemFormState } from './launcher-settings-form-types.js'
import { DialogHeader } from './DialogHeader.js'
import { DialogFooter } from './DialogFooter.js'

const itemTypeLabel = {
  template: 'Prompt Template',
  skill: 'Skill',
  profile: 'Launch',
  shortcut: 'Shortcut',
}

export function ItemFormContent(props: ItemFormDialogProps): JSX.Element {
  const sharedConfig = useContext(LauncherConfigContext)!
  const projectConfig = useContext(ProjectLauncherConfigContext)!
  const errors = useErrorReporter(() => !!props.form)
  const [form, setForm] = createSignal<ItemFormState>()
  const [submitting, setSubmitting] = createSignal(false)
  createEffect(
    () => props.form,
    (initial) => {
      setForm(initial ?? undefined)
      errors.clear()
    },
  )

  async function submitForm() {
    const f = form()
    if (!f || !f.name.trim() || submitting()) return
    errors.clear()
    setSubmitting(true)
    try {
      const fields =
        f.itemType === 'profile' || f.itemType === 'shortcut'
          ? {
              name: f.name,
              command: f.text,
            }
          : {
              name: f.name,
              text: f.text,
            }
      const result = await (f.scope === 'app' ? sharedConfig : projectConfig).update((current) => {
        const key = itemCollections[f.itemType]
        const items = current[key] ?? []
        if (items.some((item) => item.name === fields.name && (f.mode === 'add' || item.name !== f.oldName))) {
          throw createValidationError(`An item named "${fields.name}" already exists`, 'name')
        }
        if (f.mode === 'add')
          return {
            ...current,
            [key]: [...items, fields],
          }
        if (!items.some((item) => item.name === f.oldName)) throw createNotFoundError(`Item "${f.oldName}" not found`)
        return {
          ...current,
          [key]: items.map((item) =>
            item.name === f.oldName
              ? {
                  ...item,
                  ...fields,
                }
              : item,
          ),
          columnDefaults: updateLauncherReferences(current.columnDefaults, f.itemType, f.oldName!, f.name),
        }
      })
      if (result.type === 'Failure') errors.report(result.error)
      else props.onClose()
    } catch (error) {
      errors.report(errorPayload(error, 'Save failed'))
    } finally {
      setSubmitting(false)
    }
  }

  useModEnterSubmit({
    onSubmit: submitForm,
    disabled: () => submitting() || !form()?.name.trim(),
    active: () => !!props.form,
  })
  return (
    <DialogRoot open={!!props.form} onOpenChange={props.onClose} class="max-w-lg p-0">
      <DialogForm state={form()}>
        {(f) => (
          <>
            <DialogHeader title={`${f().mode === 'add' ? 'Add' : 'Edit'} ${itemTypeLabel[f().itemType]}`} />
            <div class="space-y-3 px-6 py-4">
              <div>
                <label class="field-label">Name</label>
                <input
                  type="text"
                  value={f().name}
                  onInput={(e) =>
                    setForm({
                      ...f(),
                      name: e.currentTarget.value,
                    })
                  }
                  class="input input-sm"
                  data-testid="launcher-settings-item-form-name-input"
                  placeholder={
                    f().itemType === 'profile'
                      ? 'Launch name'
                      : f().itemType === 'skill'
                        ? 'Skill name'
                        : f().itemType === 'shortcut'
                          ? 'Shortcut name'
                          : 'Prompt name'
                  }
                />
                <ErrorField field="name" />
              </div>
              <div>
                <label class="field-label">{f().itemType === 'shortcut' || f().itemType === 'profile' ? 'Command' : 'Prompt'}</label>
                <textarea
                  value={f().text}
                  onInput={(e) =>
                    setForm({
                      ...f(),
                      text: e.currentTarget.value,
                    })
                  }
                  class="input min-h-[280px]"
                  data-testid="launcher-settings-item-form-text-input"
                  placeholder={
                    f().itemType === 'profile'
                      ? 'e.g. bash run-agent.sh or powershell -File run-agent.ps1'
                      : f().itemType === 'shortcut'
                        ? 'e.g. code {{projectPath}}'
                        : 'Prompt text with {{placeholders}}'
                  }
                />
                <p class="mt-1 text-xs text-muted-foreground">
                  {f().itemType === 'profile'
                    ? '{{initialPrompt}} {{windowTitle}} {{agentDisplayName}} ' +
                      '{{herdrWorkspaceLabel}} {{herdrPaneLabel}} {{markerPath}} ' +
                      '{{configDefaultsDir}} {{appConfigDir}}'
                    : f().itemType === 'shortcut'
                      ? [
                          '{{ticketDir}} {{ticketSlug}}',
                          '{{ticketTitle}} {{ticketNumber}}',
                          '{{ticketStatus}} {{projectPath}}',
                          '{{projectSlug}} {{launchDir}}',
                        ].join(' ')
                      : f().itemType === 'template'
                        ? [
                            '{{ticketDir}} {{ticketSlug}}',
                            '{{ticketTitle}} {{ticketNumber}}',
                            '{{ticketStatus}} {{projectPath}}',
                            '{{projectSlug}} {{skills}}',
                          ].join(' ')
                        : [
                            '{{ticketDir}} {{ticketSlug}}',
                            '{{ticketTitle}} {{ticketNumber}}',
                            '{{ticketStatus}} {{projectPath}}',
                            '{{projectSlug}}',
                          ].join(' ')}
                </p>
                <Show when={(f().itemType === 'profile' || f().itemType === 'shortcut') && usesWindowsBatchCommand(f().text)}>
                  <p
                    class={'mt-2 rounded-md border border-warning/40 bg-warning/10 ' + 'px-3 py-2 text-xs'}
                    data-testid="launcher-settings-item-form-batch-warning"
                  >
                    Windows CMD (.cmd) and batch (.bat) files cannot receive multi-line arguments. Use an .exe or PowerShell script (.ps1)
                    instead.
                  </p>
                </Show>
              </div>
              <Show when={f().mode === 'add'}>
                <div>
                  <label class="field-label">Scope</label>
                  <div class="flex gap-4">
                    <label class="flex items-center gap-1.5 text-sm">
                      <input
                        type="radio"
                        name="scope"
                        checked={f().scope === 'app'}
                        onChange={() =>
                          setForm({
                            ...f(),
                            scope: 'app',
                          })
                        }
                        data-testid="launcher-settings-item-form-scope-app"
                      />{' '}
                      User
                    </label>
                    <label class="flex items-center gap-1.5 text-sm">
                      <input
                        type="radio"
                        name="scope"
                        checked={f().scope === 'project'}
                        onChange={() =>
                          setForm({
                            ...f(),
                            scope: 'project',
                          })
                        }
                        data-testid="launcher-settings-item-form-scope-project"
                      />{' '}
                      Project
                    </label>
                  </div>
                </div>
              </Show>
            </div>
            <DialogFooter>
              <button onClick={props.onClose} class="btn-secondary" data-testid="launcher-settings-item-form-cancel">
                Cancel
              </button>
              <button
                onClick={submitForm}
                disabled={submitting() || !f().name.trim()}
                title={modEnterHint()}
                class="btn-primary"
                data-testid="launcher-settings-item-form-submit"
              >
                {f().mode === 'add' ? 'Add' : 'Save'}
              </button>
            </DialogFooter>
          </>
        )}
      </DialogForm>
    </DialogRoot>
  )
}
