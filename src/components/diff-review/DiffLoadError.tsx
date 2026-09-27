import type { JSX } from '@solidjs/web'
import { errorPayload } from '~/core/shared/errors.js'
import LoadError from '../shared/LoadError.js'

export function DiffLoadError(props: { error: unknown; onRetry(): void }): JSX.Element {
  return <LoadError error={errorPayload(props.error, 'Load diff failed')} onRetry={props.onRetry} />
}
