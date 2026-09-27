import type { UserFacingError } from '~/util/user-facing-error.js'

export function setPromptDragData(event: DragEvent, text: string, onError: (error: UserFacingError) => void) {
  if (!event.dataTransfer) {
    onError({ title: 'Drag failed', description: 'The drag carried no data, so the Review Prompt was not attached to it.' })
    return
  }
  event.dataTransfer.clearData()
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData('text/plain', text)
}
