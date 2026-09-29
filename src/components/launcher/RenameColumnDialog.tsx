import { createEffect, createSignal } from 'solid-js'
import type { JSX } from '@solidjs/web'
import { DialogRoot } from '../ui/DialogRoot.js'
import { DialogForm } from '../ui/DialogForm.js'
import { modEnterHint, useModEnterSubmit } from '~/lib/use-mod-enter-submit'
import { slugifyColumnName } from '~/lib/slugify.js'
import { type RenameFormState } from './launcher-settings-form-types.js'
import { DialogHeader } from './DialogHeader.js'
import { DialogFooter } from './DialogFooter.js'

export function RenameColumnDialog(props: {
  renameForm: RenameFormState | null | undefined
  onCancel: () => void
  onRename: (form: RenameFormState) => void
  submitting: boolean
}): JSX.Element {
  const [form, setForm] = createSignal<RenameFormState>()
  createEffect(
    () => props.renameForm,
    (initial) => {
      setForm(initial ?? undefined)
    },
  )
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
