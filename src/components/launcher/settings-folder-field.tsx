import type { JSX } from '@solidjs/web'
import { pickDirectory } from '../shared/directory-picker.js'
import { errorPayload } from '~/core/shared/errors.js'
import { ScopeBadge } from './ScopeBadge.js'
import { ErrorField } from '../shared/ErrorField.js'
import { useErrorReporter } from '../shared/error-presentation.js'

export function SettingsFolderField(props: {
  label: string
  field: string
  testId: string
  value: string
  onValueChange: (value: string) => void
  onSaveRequested: (value?: string) => void
  saving: boolean
}): JSX.Element {
  const errors = useErrorReporter()
  return (
    <section>
      <label class="field-label" for={props.testId}>
        {props.label} <ScopeBadge scope="project" />
      </label>
      <div class="flex gap-2">
        <input
          id={props.testId}
          type="text"
          value={props.value}
          onInput={(e) => props.onValueChange(e.currentTarget.value)}
          onBlur={(e) => {
            if (e.relatedTarget instanceof HTMLElement && e.relatedTarget.dataset.testid === `${props.testId}-browse`) return
            props.onSaveRequested()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') props.onSaveRequested()
          }}
          disabled={props.saving}
          class="input input-sm flex-1"
          data-testid={`${props.testId}-input`}
        />
        <button
          type="button"
          class="btn-secondary"
          disabled={props.saving}
          data-testid={`${props.testId}-browse`}
          onClick={async () => {
            try {
              const result = await pickDirectory(props.value)
              if (result.type === 'Failure') {
                errors.report(result.error)
              } else if (result.value !== undefined) {
                props.onValueChange(result.value)
                props.onSaveRequested(result.value)
              }
            } catch (e) {
              errors.report(errorPayload(e, 'Browse failed'))
            }
          }}
        >
          Browse
        </button>
      </div>
      <ErrorField field={props.field} />
    </section>
  )
}
