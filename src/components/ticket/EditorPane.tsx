import type { JSX } from '@solidjs/web'
import { Show } from 'solid-js'
import MarkdownEditor from '../shared/MarkdownEditor'
import { type FileView } from './ticket-detail-pure.js'

export function EditorPane(props: {
  view: FileView
  content: string
  onChange: (value: string) => void
  onSave?: () => void
  readOnly: boolean
  label: string
}): JSX.Element {
  return (
    <>
      <Show when={props.view.kind === 'editor'}>
        <MarkdownEditor
          value={props.content}
          onChange={props.onChange}
          onSave={props.onSave}
          placeholder="Write markdown here..."
          readOnly={props.readOnly}
        />
      </Show>
      <Show when={props.view.kind === 'image' ? props.view : undefined}>
        {(view) => (
          <div class={'flex h-full items-center justify-center overflow-auto ' + 'rounded-md border border-input bg-background p-4'}>
            <a href={view().url} target="_blank" rel="noopener noreferrer">
              <img src={view().url} alt={props.label} class="max-h-full max-w-full cursor-pointer object-contain" />
            </a>
          </div>
        )}
      </Show>
      <Show when={props.view.kind === 'unsupported'}>
        <div class="flex h-full items-center justify-center rounded-md border border-input bg-background">
          <p class="text-sm text-muted-foreground">Unable to show this file type</p>
        </div>
      </Show>
    </>
  )
}
