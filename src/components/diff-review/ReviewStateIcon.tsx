import type { JSX } from '@solidjs/web'
import { Show } from 'solid-js'
import { Check } from '~/components/ui/icons/Check.js'
import { CircleQuestionMark } from '~/components/ui/icons/CircleQuestionMark.js'
import { type FileReviewStatus } from './file-review-status.js'

export function ReviewStateIcon(props: { status: FileReviewStatus }): JSX.Element {
  return (
    <Show when={props.status === 'reviewed'} fallback={<CircleQuestionMark size={13} class="text-primary" aria-label="Not reviewed" />}>
      <Check size={13} class="text-muted-foreground" aria-label="Reviewed" />
    </Show>
  )
}
