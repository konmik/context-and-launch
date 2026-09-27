import type { JSX } from '@solidjs/web'
import { TriangleAlert } from '~/components/ui/icons/TriangleAlert.js'
import { useErrorReporter } from '../shared/error-presentation.js'
import { errorPayload } from '~/core/shared/errors.js'

export default function SyncStatusErrorButton(props: { error: unknown }): JSX.Element {
  const errors = useErrorReporter()
  const error = () => errorPayload(props.error, 'Sync status unavailable')
  return (
    <button
      class="btn-icon border-destructive text-destructive hover:bg-destructive/10"
      title={error().description}
      data-testid="sync-status-error-button"
      onClick={() => errors.report(error())}
    >
      <TriangleAlert size={16} />
    </button>
  )
}
