import type { JSX } from '@solidjs/web'
import { For } from 'solid-js'

export function NamedEntrySelect(props: {
  label: string
  value: string
  options: {
    name: string
  }[]
  testId: string
  onChange(name: string): void
}): JSX.Element {
  return (
    <div>
      <label class="field-label">{props.label}</label>
      <select value={props.value} onChange={(e) => props.onChange(e.currentTarget.value)} class="input input-sm" data-testid={props.testId}>
        <For each={props.options}>
          {(option) => (
            <option value={option.name} selected={option.name === props.value}>
              {option.name}
            </option>
          )}
        </For>
      </select>
    </div>
  )
}
