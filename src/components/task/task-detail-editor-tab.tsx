import type { JSX } from '@solidjs/web'
import { Show } from 'solid-js'
import { FileToolbar } from './FileToolbar.js'
import { EditorPane } from './EditorPane.js'
import { TAB_CONTENT_CLASS } from './task-detail-parts.js'
import { activeFileLabel, isReadOnly } from './task-detail-pure.js'
import type { TaskDetailState } from './task-detail-state.js'

export function EditorTab(props: { ctrl: TaskDetailState }): JSX.Element {
  const s = props.ctrl
  return (
    <div class={`${TAB_CONTENT_CLASS} flex flex-col`}>
      <FileToolbar
        activeFile={s.activeFile()}
        options={s.allFileOptions()}
        isStale={s.isReferenceStale}
        dropdownOpen={s.dropdownOpen()}
        setDropdownOpen={s.setDropdownOpen}
        onSelect={s.selectFile}
        onTrash={s.handleTrashClick}
        onNewFile={s.openNewFileDialog}
        onBrowse={s.openNativeFileBrowser}
        browsing={s.browsing()}
        uploading={s.uploading()}
        dragging={s.dragging()}
        onDragOver={s.handleDragOver}
        onDragLeave={s.handleDragLeave}
        onDrop={s.handleDrop}
        onFileInputChange={s.handleFileInputChange}
      />
      <div class="min-h-0 flex-1" data-testid="task-detail-editor-pane" data-state={s.fileView().kind}>
        <Show
          when={s.fileView().kind !== 'loading'}
          fallback={<div class="flex h-full items-center justify-center text-sm text-muted-foreground">Loading...</div>}
        >
          <EditorPane
            view={s.fileView()}
            content={s.content()}
            onChange={s.setContent}
            onSave={s.activeFile().type === 'context' ? s.saveAll : undefined}
            readOnly={isReadOnly(s.activeFile())}
            label={activeFileLabel(s.activeFile())}
          />
        </Show>
      </div>
    </div>
  )
}
