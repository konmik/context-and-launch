import { For, Show, createEffect, createSignal, useContext } from 'solid-js'
import type { JSX } from '@solidjs/web'
import { revalidate } from '@solidjs/router'
import { X } from '~/components/ui/icons.js'
import { DialogRoot, DialogTitle, DialogCloseTrigger, DialogForm } from '../ui/dialog'
import { modEnterHint, useModEnterSubmit } from '~/lib/use-mod-enter-submit'
import { slugifyColumnName } from '~/lib/slugify.js'
import { COLUMN_COLOR_PALETTE } from '~/core/project/column-color-palette.js'
import { migrateRenamedColumn, type BoardRef } from '../board/board-api.js'
import { itemCollections, updateBoardColumns, usesWindowsBatchCommand, validateColumnName } from './launcher-settings-pure.js'
import type { LauncherItemType } from '~/core/launcher/launcher-config.js'
import { validateColumnName as requireColumnName } from '~/core/project/board-config-data.js'
import { ErrorField, ErrorScope, FieldErrorMessage, useErrorReporter } from '../shared/error-presentation.js'
import { BoardConfigContext } from '../board/board-config-storage.js'
import { createValidationError, createNotFoundError, errorPayload } from '~/core/shared/errors.js'
import { LauncherConfigContext } from './shared-launcher-config-storage.js'
import { ProjectLauncherConfigContext } from './project-launcher-config-storage.js'
import { updateLauncherReferences } from '~/core/launcher/launcher-config-data.js'
import { AppConfigContext } from '../config/app-config-storage.js'

export type ItemType = LauncherItemType

export type Scope = 'app' | 'project'

export interface ItemFormState {
  mode: 'add' | 'edit'
  itemType: ItemType
  scope: Scope
  name: string
  text: string
  oldName?: string
}

export interface ColumnFormState {
  mode: 'add' | 'edit'
  name: string
  description: string
  color: string
  oldName?: string
}

export interface RenameFormState {
  oldName: string
  newName: string
  scope: 'all' | 'current' | 'none'
}

export interface DeleteTarget {
  type: 'board' | 'column'
  id: string
  name: string
}

function DialogHeader(props: { title: string }): JSX.Element {
  return (
    <div class="flex items-center justify-between border-b border-border px-6 py-4">
      <DialogTitle class="mb-0">{props.title}</DialogTitle>
      <DialogCloseTrigger>
        <X size={16} />
      </DialogCloseTrigger>
    </div>
  )
}

function DialogFooter(props: { children: JSX.Element }): JSX.Element {
  return <div class="flex justify-end gap-2 border-t border-border px-6 py-3">{props.children}</div>
}

const itemTypeLabel = {
  template: 'Prompt Template',
  skill: 'Skill',
  profile: 'Launch',
  shortcut: 'Shortcut',
}

interface ItemFormDialogProps {
  form: ItemFormState | null | undefined
  onClose: () => void
}

export function ItemFormDialog(props: ItemFormDialogProps): JSX.Element {
  return <ErrorScope active={!!props.form}><ItemFormContent {...props} /></ErrorScope>
}

function ItemFormContent(props: ItemFormDialogProps): JSX.Element {
  const sharedConfig = useContext(LauncherConfigContext)!
  const projectConfig = useContext(ProjectLauncherConfigContext)!
  const errors = useErrorReporter(() => !!props.form)
  const [form, setForm] = createSignal<ItemFormState>()
  const [submitting, setSubmitting] = createSignal(false)
  createEffect(() => props.form, (initial) => {
    setForm(initial ?? undefined)
    errors.clear()
  })

  async function submitForm() {
    const f = form()
    if (!f || !f.name.trim() || submitting()) return
    errors.clear()
    setSubmitting(true)
    try {
      const fields = f.itemType === 'profile' || f.itemType === 'shortcut'
        ? { name: f.name, command: f.text }
        : { name: f.name, text: f.text }
      const result = await (f.scope === 'app' ? sharedConfig : projectConfig).update((current) => {
        const key = itemCollections[f.itemType]
        const items = current[key] ?? []
        if (items.some((item) => item.name === fields.name && (f.mode === 'add' || item.name !== f.oldName))) {
          throw createValidationError(`An item named "${fields.name}" already exists`, 'name')
        }
        if (f.mode === 'add') return { ...current, [key]: [...items, fields] }
        if (!items.some((item) => item.name === f.oldName)) throw createNotFoundError(`Item "${f.oldName}" not found`)
        return {
          ...current,
          [key]: items.map((item) => item.name === f.oldName ? { ...item, ...fields } : item),
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

interface ColumnFormDialogProps {
  form: ColumnFormState | null | undefined
  boardId: string
  projectSlug: string
  onClose: () => void
}

export function ColumnFormDialog(props: ColumnFormDialogProps): JSX.Element {
  return <ErrorScope active={!!props.form}><ColumnFormContent {...props} /></ErrorScope>
}

function ColumnFormContent(props: ColumnFormDialogProps): JSX.Element {
  const storage = useContext(BoardConfigContext)!
  const projectConfig = useContext(ProjectLauncherConfigContext)!
  const appConfig = useContext(AppConfigContext)!
  const errors = useErrorReporter(() => !!props.form)
  const [columnForm, setColumnForm] = createSignal<ColumnFormState>()
  const [renameForm, setRenameForm] = createSignal<RenameFormState | null>(null)
  const [submitting, setSubmitting] = createSignal(false)
  createEffect(() => props.form, (initial) => {
    setColumnForm(initial ?? undefined)
    setRenameForm(null)
    errors.clear()
  })
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
      setRenameForm({ oldName: form.oldName!, newName: form.name, scope: 'all' })
      return
    }
    const boardId = props.boardId
    const projectSlug = props.projectSlug
    const newName = slugifyColumnName(rename?.newName ?? form.name)
    setSubmitting(true)
    try {
      const result = await storage.update((current) => updateBoardColumns(current, boardId, (columns) => {
        requireColumnName(newName, columns.map((column) => column.name), form.oldName)
        const content = { name: newName, description: form.description.trim() || undefined, color: form.color || undefined }
        if (form.mode === 'add') return [...columns, content]
        if (!columns.some((column) => column.name === form.oldName)) throw new Error(`Column not found: ${form.oldName}`)
        return columns.map((column) => column.name === form.oldName ? { ...column, ...content } : column)
      }))
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
          const rollback = await storage.update((current) => updateBoardColumns(current, boardId, (columns) =>
            columns.map((column) => column.name === newName ? { ...column, name: rename.oldName } : column),
          ))
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
    <RenameColumnDialog renameForm={props.form ? renameForm() : undefined} onCancel={() => setRenameForm(null)} onRename={saveColumn} submitting={submitting()} />
    </>
  )
}

export function RenameColumnDialog(props: {
  renameForm: RenameFormState | null | undefined
  onCancel: () => void
  onRename: (form: RenameFormState) => void
  submitting: boolean
}): JSX.Element {
  const [form, setForm] = createSignal<RenameFormState>()
  createEffect(() => props.renameForm, (initial) => setForm(initial ?? undefined))
  useModEnterSubmit({
    onSubmit: () => {
      const current = form()
      if (current) props.onRename(current)
    },
    disabled: () => props.submitting,
    active: () => !!props.renameForm,
  })
  return (
    <DialogRoot open={!!props.renameForm} onOpenChange={props.onCancel} class="max-w-lg p-0">
      <DialogForm state={form()}>
        {(rf) => (
          <>
            <DialogHeader title="Rename Column" />
            <div class="space-y-3 px-6 py-4">
              <p class="text-sm">
                Renaming "{rf().oldName}" to "{slugifyColumnName(rf().newName)}".
              </p>
              <p class="text-sm text-muted-foreground">Update ticket statuses and column defaults?</p>
              <div class="space-y-2">
                <label class="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="rename-scope"
                    checked={rf().scope === 'all'}
                    onChange={() =>
                      setForm({
                        ...rf(),
                        scope: 'all',
                      })
                    }
                    data-testid="launcher-settings-columns-rename-scope-all"
                  />
                  All projects using this board
                </label>
                <label class="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="rename-scope"
                    checked={rf().scope === 'current'}
                    onChange={() =>
                      setForm({
                        ...rf(),
                        scope: 'current',
                      })
                    }
                    data-testid="launcher-settings-columns-rename-scope-current"
                  />
                  Current project only
                </label>
                <label class="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="rename-scope"
                    checked={rf().scope === 'none'}
                    onChange={() =>
                      setForm({
                        ...rf(),
                        scope: 'none',
                      })
                    }
                    data-testid="launcher-settings-columns-rename-scope-none"
                  />
                  None (rename column only)
                </label>
              </div>
            </div>
            <DialogFooter>
              <button onClick={props.onCancel} class="btn-secondary" data-testid="launcher-settings-columns-rename-cancel">
                Cancel
              </button>
              <button
                onClick={() => props.onRename(rf())}
                disabled={props.submitting}
                title={modEnterHint()}
                class="btn-primary"
                data-testid="launcher-settings-columns-rename-confirm"
              >
                Rename
              </button>
            </DialogFooter>
          </>
        )}
      </DialogForm>
    </DialogRoot>
  )
}

interface CreateBoardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (boardId: string) => void
}

export function CreateBoardDialog(props: CreateBoardDialogProps): JSX.Element {
  return <ErrorScope active={props.open}><CreateBoardContent {...props} /></ErrorScope>
}

function CreateBoardContent(props: CreateBoardDialogProps): JSX.Element {
  const storage = useContext(BoardConfigContext)!
  const errors = useErrorReporter(() => props.open)
  const [name, setName] = createSignal('')
  const [submitting, setSubmitting] = createSignal(false)
  createEffect(() => props.open, (open) => {
    if (open) setName('')
  })

  async function createBoard() {
    if (submitting() || !name().trim()) return
    const boardName = name().trim()
    const boardId = slugifyColumnName(boardName)
    errors.clear()
    setSubmitting(true)
    try {
      await errors.runAndReportErrors(async () => {
        const result = await storage.update((current) => {
          if (!boardId) throw createValidationError('Board name must not be empty', 'name')
          if (boardId === 'undefined') throw createValidationError('Board name "undefined" is reserved', 'name')
          if (current.some((board) => board.id === boardId)) throw createValidationError(`Board with id "${boardId}" already exists`, 'name')
          return [...current, { id: boardId, name: boardName, columns: [] }]
        })
        if (result.type === 'Success') {
          props.onOpenChange(false)
          props.onCreated(boardId)
        }
        return result
      })
    } finally {
      setSubmitting(false)
    }
  }

  useModEnterSubmit({
    onSubmit: createBoard,
    disabled: () => submitting() || !name().trim(),
    active: () => props.open,
  })
  return (
    <DialogRoot open={props.open} onOpenChange={props.onOpenChange} class="max-w-sm p-0">
      <DialogHeader title="Add Board" />
      <div class="space-y-3 px-6 py-4">
        <div>
          <label class="field-label">Board name</label>
          <input
            type="text"
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
            class="input input-sm"
            data-testid="launcher-settings-columns-board-name-input"
            placeholder="e.g. Development"
          />
          <ErrorField field="name" />
        </div>
      </div>
      <DialogFooter>
        <button
          onClick={() => props.onOpenChange(false)}
          class="btn-secondary"
          data-testid="launcher-settings-columns-board-form-cancel"
        >
          Cancel
        </button>
        <button
          onClick={createBoard}
          disabled={submitting() || !name().trim()}
          title={modEnterHint()}
          class="btn-primary"
          data-testid="launcher-settings-columns-board-form-submit"
        >
          Add
        </button>
      </DialogFooter>
    </DialogRoot>
  )
}

export function DeleteConfirmDialog(props: {
  deleteConfirm: DeleteTarget | null
  setDeleteConfirm: (target: DeleteTarget | null) => void
  onDeleteBoard: () => void
  onDeleteColumn: () => void
}): JSX.Element {
  return (
    <DialogRoot open={!!props.deleteConfirm} onOpenChange={() => props.setDeleteConfirm(null)} class="max-w-sm p-0">
      <DialogForm state={props.deleteConfirm}>
        {(dc) => (
          <>
            <DialogHeader title={`Delete ${dc().type === 'board' ? 'Board' : 'Column'}`} />
            <div class="px-6 py-4">
              <p class="text-sm" data-testid="launcher-settings-columns-delete-confirm-message">
                {dc().type === 'board'
                  ? `Delete board "${dc().name}"? This cannot be undone.`
                  : `Delete column "${dc().name}"? Tickets with this status ` + 'will appear in the undefined column.'}
              </p>
            </div>
            <DialogFooter>
              <button
                onClick={() => props.setDeleteConfirm(null)}
                class="btn-secondary"
                data-testid="launcher-settings-columns-delete-cancel"
              >
                Cancel
              </button>
              <button
                onClick={dc().type === 'board' ? props.onDeleteBoard : props.onDeleteColumn}
                class="btn-primary bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="launcher-settings-columns-delete-confirm-btn"
              >
                Delete
              </button>
            </DialogFooter>
          </>
        )}
      </DialogForm>
    </DialogRoot>
  )
}

export function ProjectBoardConfirmDialog(props: {
  projectBoardConfirm: BoardRef | null
  setProjectBoardConfirm: (target: BoardRef | null) => void
  onConfirm: () => void
}): JSX.Element {
  return (
    <DialogRoot open={!!props.projectBoardConfirm} onOpenChange={() => props.setProjectBoardConfirm(null)} class="max-w-sm p-0">
      <DialogForm state={props.projectBoardConfirm}>
        {(pbc) => (
          <>
            <DialogHeader title="Set Project Board" />
            <div class="px-6 py-4">
              <p class="text-sm" data-testid="launcher-settings-columns-set-project-board-message">
                Set "{pbc().name}" as the board for this project? Tickets whose status is not a column in this board will appear in the
                undefined column and must be updated manually.
              </p>
            </div>
            <DialogFooter>
              <button
                onClick={() => props.setProjectBoardConfirm(null)}
                class="btn-secondary"
                data-testid="launcher-settings-columns-set-project-board-cancel-btn"
              >
                Cancel
              </button>
              <button onClick={props.onConfirm} class="btn-primary" data-testid="launcher-settings-columns-set-project-board-confirm-btn">
                Set board
              </button>
            </DialogFooter>
          </>
        )}
      </DialogForm>
    </DialogRoot>
  )
}
