import { createEffect, createSignal, useContext } from 'solid-js'
import type { JSX } from '@solidjs/web'
import { DialogRoot } from '../ui/DialogRoot.js'
import { modEnterHint, useModEnterSubmit } from '~/lib/use-mod-enter-submit'
import { slugifyColumnName } from '~/lib/slugify.js'
import { ErrorField } from '../shared/ErrorField.js'
import { useErrorReporter } from '../shared/error-presentation.js'
import { BoardConfigContext } from '../board/board-config-storage.js'
import { createValidationError } from '~/core/shared/errors.js'
import { type CreateBoardDialogProps } from './launcher-settings-form-types.js'
import { DialogHeader } from './DialogHeader.js'
import { DialogFooter } from './DialogFooter.js'

export function CreateBoardContent(props: CreateBoardDialogProps): JSX.Element {
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
