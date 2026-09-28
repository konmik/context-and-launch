import type { JSX } from '@solidjs/web'
import { DialogRoot } from '../ui/DialogRoot.js'
import { DialogTitle } from '../ui/DialogTitle.js'
import { modEnterHint } from '~/lib/use-mod-enter-submit'

export function NewFileDialog(props: {
  open: boolean
  name: string
  setName: (value: string) => void
  onSubmit: () => void
  onClose: () => void
}): JSX.Element {
  return (
    <DialogRoot
      open={props.open}
      onOpenChange={props.onClose}
      onMouseDown={(e: MouseEvent) => {
        if (!(e.target instanceof HTMLInputElement)) e.preventDefault()
      }}
    >
      <DialogTitle>New Markdown File</DialogTitle>
      <label class="field-label">File name (without .md extension)</label>
      <input
        type="text"
        value={props.name}
        onInput={(e) => props.setName(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') props.onSubmit()
          if (e.key === 'Escape') props.onClose()
        }}
        autofocus
        class="input mb-4"
        placeholder="e.g. design-notes"
        data-testid="task-detail-new-file-name-input"
      />
      <div class="flex justify-end gap-2">
        <button type="button" onClick={props.onClose} class="btn-secondary" data-testid="task-detail-new-file-cancel">
          Cancel
        </button>
        <button
          type="button"
          onClick={props.onSubmit}
          disabled={!props.name.trim()}
          title={modEnterHint()}
          class="btn-primary"
          data-testid="task-detail-new-file-create"
        >
          Create
        </button>
      </div>
    </DialogRoot>
  )
}
