import { For, Show, createEffect, createSignal, useContext } from 'solid-js'
import type { JSX } from '@solidjs/web'
import { revalidate } from '@solidjs/router'
import { X } from '~/components/ui/icons/X.js'
import { DialogRoot } from '../ui/DialogRoot.js'
import { DialogForm } from '../ui/DialogForm.js'
import { modEnterHint, useModEnterSubmit } from '~/lib/use-mod-enter-submit'
import { slugifyColumnName } from '~/lib/slugify.js'
import { COLUMN_COLOR_PALETTE } from '~/core/project/column-color-palette.js'
import { migrateRenamedColumn } from '../board/board-api.js'
import { updateBoardColumns, validateColumnName } from './launcher-settings-pure.js'
import { validateColumnName as requireColumnName } from '~/core/project/board-config-data.js'
import { ErrorField } from '../shared/ErrorField.js'
import { FieldErrorMessage } from '../shared/FieldErrorMessage.js'
import { useErrorReporter } from '../shared/error-presentation.js'
import { BoardConfigContext } from '../board/board-config-storage.js'
import { errorPayload } from '~/core/shared/errors.js'
import { ProjectLauncherConfigContext } from './project-launcher-config-storage.js'
import { AppConfigContext } from '../config/app-config-storage.js'
import { type ColumnFormDialogProps } from './launcher-settings-form-types.js'
import { type ColumnFormState } from './launcher-settings-form-types.js'
import { type RenameFormState } from './launcher-settings-form-types.js'
import { DialogHeader } from './DialogHeader.js'
import { DialogFooter } from './DialogFooter.js'
import { RenameColumnDialog } from './RenameColumnDialog.js'

export function ColumnFormContent(props: ColumnFormDialogProps): JSX.Element {
  const storage = useContext(BoardConfigContext)!
  const projectConfig = useContext(ProjectLauncherConfigContext)!
  const appConfig = useContext(AppConfigContext)!
  const errors = useErrorReporter(() => !!props.form)
  const [columnForm, setColumnForm] = createSignal<ColumnFormState>()
  const [renameForm, setRenameForm] = createSignal<RenameFormState | null>(null)
  const [submitting, setSubmitting] = createSignal(false)
  createEffect(
    () => props.form,
    (initial) => {
      setColumnForm(initial ?? undefined)
      setRenameForm(null)
      errors.clear()
    },
  )
  const validation = () => {
    const form = columnForm()
    const board = storage.get().find((board) => board.id === props.boardId)
    return form && board ? validateColumnName(form.name, form.mode, form.oldName, board.columns) : undefined
  }

  async function saveColumn(rename?: RenameFormState) {
    const form = columnForm()
    if (!form || !form.name.trim() || validation() || submitting()) return
    errors.clear()
    if (form.mode === 'edit' && slugifyColumnName(form.name) !== form.oldName && !rename) {
      setRenameForm({
        oldName: form.oldName!,
        newName: form.name,
        scope: 'all',
      })
      return
    }
    const boardId = props.boardId
    const projectSlug = props.projectSlug
    const newName = slugifyColumnName(rename?.newName ?? form.name)
    setSubmitting(true)
    try {
      const result = await storage.update((current) =>
        updateBoardColumns(current, boardId, (columns) => {
          requireColumnName(
            newName,
            columns.map((column) => column.name),
            form.oldName,
          )
          const content = {
            name: newName,
            description: form.description.trim() || undefined,
            color: form.color || undefined,
          }
          if (form.mode === 'add') return [...columns, content]
          if (!columns.some((column) => column.name === form.oldName)) throw new Error(`Column not found: ${form.oldName}`)
          return columns.map((column) =>
            column.name === form.oldName
              ? {
                  ...column,
                  ...content,
                }
              : column,
          )
        }),
      )
      if (result.type === 'Failure') {
        errors.report(result.error)
        return
      }
      if (rename && rename.scope !== 'none') {
        try {
          const migration = await migrateRenamedColumn(boardId, rename.oldName, newName, rename.scope, projectSlug)
          if (migration.type === 'Failure') throw migration.error
          const projectBoardId = appConfig.get().projects.find((project) => project.projectSlug === projectSlug)?.boardId
          if (rename.scope === 'current' || boardId === (projectBoardId ?? storage.get()[0]?.id)) {
            const refreshed = await projectConfig.refresh()
            if (refreshed.type === 'Failure') throw refreshed.error
          }
          await revalidate('project-page')
        } catch (error) {
          const rollback = await storage.update((current) =>
            updateBoardColumns(current, boardId, (columns) =>
              columns.map((column) =>
                column.name === newName
                  ? {
                      ...column,
                      name: rename.oldName,
                    }
                  : column,
              ),
            ),
          )
          errors.report(errorPayload(error, 'Migration failed'))
          if (rollback.type === 'Failure') errors.report(rollback.error)
          return
        }
      }
      props.onClose()
    } catch (error) {
      errors.report(errorPayload(error, 'Save failed'))
    } finally {
      setSubmitting(false)
    }
  }

  useModEnterSubmit({
    onSubmit: () => saveColumn(),
    disabled: () => submitting() || !columnForm()?.name.trim() || !!validation(),
    active: () => !!props.form && !renameForm(),
  })
  return (
    <>
      <DialogRoot open={!!props.form && !renameForm()} onOpenChange={props.onClose} class="max-w-lg p-0">
        <DialogForm state={columnForm()}>
          {(cf) => (
            <>
              <DialogHeader title={cf().mode === 'add' ? 'Add Column' : 'Edit Column'} />
              <div class="space-y-3 px-6 py-4">
                <div>
                  <label class="field-label">Name</label>
                  <input
                    ref={(el) => setTimeout(() => el.focus())}
                    type="text"
                    value={cf().name}
                    onInput={(e) =>
                      setColumnForm({
                        ...cf(),
                        name: e.currentTarget.value,
                      })
                    }
                    class="input input-sm"
                    data-testid="launcher-settings-columns-name-input"
                    placeholder="e.g. In Progress"
                  />
                  <ErrorField field="name" />
                  <Show when={cf().name.trim()}>
                    <p class="mt-1 text-xs text-muted-foreground" data-testid="launcher-settings-columns-slug-preview">
                      Column slug: {slugifyColumnName(cf().name)}
                    </p>
                  </Show>
                  <Show when={validation()}>
                    <div data-testid="launcher-settings-columns-name-error">
                      <FieldErrorMessage error={validation()} />
                    </div>
                  </Show>
                </div>
                <div>
                  <label class="field-label">Description (optional)</label>
                  <textarea
                    value={cf().description}
                    onInput={(e) =>
                      setColumnForm({
                        ...cf(),
                        description: e.currentTarget.value,
                      })
                    }
                    class="input min-h-[60px]"
                    data-testid="launcher-settings-columns-desc-input"
                    placeholder="Brief description of this column"
                  />
                </div>
                <div>
                  <label class="field-label">Color (optional)</label>
                  <div class="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setColumnForm({
                          ...cf(),
                          color: '',
                        })
                      }
                      class={
                        'flex h-6 w-6 items-center justify-center rounded-md border border-border ' +
                        `text-muted-foreground ${cf().color === '' ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`
                      }
                      data-testid="launcher-settings-columns-color-none"
                      title="None"
                      aria-label="No color"
                    >
                      <X size={14} />
                    </button>
                    <For each={COLUMN_COLOR_PALETTE}>
                      {(option) => (
                        <button
                          type="button"
                          onClick={() =>
                            setColumnForm({
                              ...cf(),
                              color: option.hex,
                            })
                          }
                          class={`h-6 w-6 rounded-md border border-border ${cf().color === option.hex ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}
                          style={{
                            'background-color': option.hex,
                          }}
                          data-testid="launcher-settings-columns-color-option"
                          data-color-hex={option.hex}
                          title={option.name}
                          aria-label={option.name}
                        />
                      )}
                    </For>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <button onClick={props.onClose} class="btn-secondary" data-testid="launcher-settings-columns-form-cancel">
                  Cancel
                </button>
                <button
                  onClick={() => saveColumn()}
                  disabled={submitting() || !cf().name.trim() || !!validation()}
                  title={modEnterHint()}
                  class="btn-primary"
                  data-testid="launcher-settings-columns-form-submit"
                >
                  {cf().mode === 'add' ? 'Add' : 'Save'}
                </button>
              </DialogFooter>
            </>
          )}
        </DialogForm>
      </DialogRoot>
      <RenameColumnDialog
        renameForm={props.form ? renameForm() : undefined}
        onCancel={() => setRenameForm(null)}
        onRename={saveColumn}
        submitting={submitting()}
      />
    </>
  )
}
