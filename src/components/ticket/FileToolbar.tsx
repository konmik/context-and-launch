import type { JSX } from '@solidjs/web'
import { Show, For } from 'solid-js'
import { Portal } from '@solidjs/web'
import { ChevronDown } from '~/components/ui/icons/ChevronDown.js'
import { TriangleAlert } from '~/components/ui/icons/TriangleAlert.js'
import { Trash2 } from '~/components/ui/icons/Trash2.js'
import { Plus } from '~/components/ui/icons/Plus.js'
import { Upload } from '~/components/ui/icons/Upload.js'
import { Folder } from '~/components/ui/icons/Folder.js'
import { type ActiveFile, activeFileLabel, isActiveFileMatch } from './ticket-detail-pure.js'
import { createPopupOverlay } from '../ui/overlay.js'

export function FileToolbar(props: {
  activeFile: ActiveFile
  options: ActiveFile[]
  isStale: (path: string) => boolean
  dropdownOpen: boolean
  setDropdownOpen: (open: boolean) => void
  onSelect: (af: ActiveFile) => void
  onTrash: () => void
  onNewFile: () => void
  onBrowse: () => void
  browsing: boolean
  uploading: boolean
  dragging: boolean
  onDragOver: (e: DragEvent) => void
  onDragLeave: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
  onFileInputChange: (e: Event) => void
}): JSX.Element {
  let dropdownBtnRef: HTMLButtonElement | undefined
  let dropdownContentRef: HTMLDivElement | undefined
  let fileInputRef: HTMLInputElement | undefined
  const overlay = createPopupOverlay({
    open: () => props.dropdownOpen,
    onDismiss: () => props.setDropdownOpen(false),
    trigger: () => dropdownBtnRef,
    content: () => dropdownContentRef,
  })
  return (
    <>
      <div class="flex items-center gap-2 pt-4 pb-2">
        <div class="min-w-0 flex-1">
          <button
            ref={(el) => (dropdownBtnRef = el)}
            type="button"
            data-testid="ticket-detail-editor-file-dropdown-trigger"
            aria-expanded={props.dropdownOpen}
            onClick={() => props.setDropdownOpen(!props.dropdownOpen)}
            class={'flex h-9 w-full items-center justify-between ' + 'rounded-md border border-input bg-background px-3 text-sm'}
          >
            <span class="truncate">
              {activeFileLabel(props.activeFile)}
              {props.activeFile.type === 'reference' && <span class="ml-1 text-xs text-muted-foreground">REFERENCE</span>}
            </span>
            <ChevronDown size={16} class="ml-2 shrink-0" />
          </button>
          <Show when={props.dropdownOpen}>
            <Portal mount={overlay.getPortalMount()}>
              <div
                ref={dropdownContentRef}
                class="fixed max-h-60 overflow-auto rounded-md border border-border bg-popover py-1"
                style={{
                  top: `${(dropdownBtnRef?.getBoundingClientRect().bottom ?? 0) + 4}px`,
                  left: `${dropdownBtnRef?.getBoundingClientRect().left ?? 0}px`,
                  width: `${dropdownBtnRef?.getBoundingClientRect().width ?? 0}px`,
                }}
              >
                <For each={props.options}>
                  {(option) => (
                    <button
                      type="button"
                      data-testid="ticket-detail-editor-file-dropdown-option"
                      onClick={() => props.onSelect(option)}
                      class={
                        'flex w-full items-center gap-1 px-3 py-2 text-left ' +
                        'text-sm hover:bg-accent hover:text-accent-foreground ' +
                        (isActiveFileMatch(option, props.activeFile) ? 'font-semibold' : '')
                      }
                    >
                      <span class="truncate">{activeFileLabel(option)}</span>
                      {option.type === 'reference' && (
                        <>
                          <span class="shrink-0 text-xs text-muted-foreground">REFERENCE</span>
                          {props.isStale(option.path) && (
                            <span class="shrink-0" title="File not found on disk">
                              <TriangleAlert size={14} class="text-warning" />
                            </span>
                          )}
                        </>
                      )}
                    </button>
                  )}
                </For>
              </div>
            </Portal>
          </Show>
        </div>
        <button
          type="button"
          data-testid="ticket-detail-editor-trash-button"
          onClick={props.onTrash}
          class="btn-icon text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
          title={props.activeFile.type === 'reference' ? 'Remove reference' : 'Delete file'}
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-2 pb-2">
        <button
          type="button"
          data-testid="ticket-detail-editor-new-file-button"
          onClick={props.onNewFile}
          class="btn-secondary btn-sm gap-1.5"
        >
          <Plus size={14} />
          New markdown file
        </button>
        <button
          type="button"
          data-testid="ticket-detail-editor-copy-button"
          onClick={() => fileInputRef?.click()}
          onDragOver={props.onDragOver}
          onDragLeave={props.onDragLeave}
          onDrop={props.onDrop}
          disabled={props.uploading}
          class={`btn-secondary btn-sm gap-1.5 ${props.dragging ? 'border-primary bg-primary/10 text-primary' : ''}`}
        >
          <Upload size={14} />
          Drop a file to copy
        </button>
        <input ref={(el) => (fileInputRef = el)} type="file" multiple class="hidden" onChange={props.onFileInputChange} />
        <button
          type="button"
          data-testid="ticket-detail-editor-add-reference-button"
          onClick={props.onBrowse}
          disabled={props.browsing}
          class="btn-secondary btn-sm gap-1.5"
        >
          <Folder size={14} />
          Add file reference
        </button>
      </div>
    </>
  )
}
