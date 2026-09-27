import type { JSX } from '@solidjs/web'
import { X } from '~/components/ui/icons/X.js'
import { DialogTitle } from '../ui/DialogTitle.js'
import { DialogCloseTrigger } from '../ui/DialogCloseTrigger.js'

export function DialogHeader(props: { title: string }): JSX.Element {
  return (
    <div class="flex items-center justify-between border-b border-border px-6 py-4">
      <DialogTitle class="mb-0">{props.title}</DialogTitle>
      <DialogCloseTrigger>
        <X size={16} />
      </DialogCloseTrigger>
    </div>
  )
}
