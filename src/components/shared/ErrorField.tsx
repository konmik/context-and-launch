import type { JSX } from '@solidjs/web'
import { createSignal, createEffect, useContext } from 'solid-js'
import type { UserFacingError } from '~/util/user-facing-error.js'
import { ErrorPresentationContext } from './error-presentation.js'
import { FieldErrorMessage } from './FieldErrorMessage.js'

export function ErrorField(props: { field: string }): JSX.Element {
  const scope = useContext(ErrorPresentationContext)
  const [error, setError] = createSignal<UserFacingError>()
  createEffect(() => props.field, (field) => scope.register(field, setError))
  return <FieldErrorMessage error={error()} />
}
