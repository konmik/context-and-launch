import type { JSX } from '@solidjs/web'
import { For, Show } from 'solid-js'
import { ChevronDown } from '~/components/ui/icons/ChevronDown.js'
import { ChevronRight } from '~/components/ui/icons/ChevronRight.js'
import { FileCode2 } from '~/components/ui/icons/FileCode2.js'
import { FileWarning } from '~/components/ui/icons/FileWarning.js'
import { FolderOpen } from '~/components/ui/icons/FolderOpen.js'
import type { ReviewFileSnapshot } from '~/core/diff-review/diff-review-types.js'
import { type DiffReviewFileTreeNode } from './diff-review-file-tree.js'
import { type FileReviewStatus } from './file-review-status.js'
import { ReviewStateIcon } from './ReviewStateIcon.js'

export function FileTreeNodes(props: {
  nodes: DiffReviewFileTreeNode[]
  activePath: string
  collapsedDirectoryPaths: ReadonlySet<string>
  fileForPath(filePath: string): ReviewFileSnapshot | undefined
  statusFor(file: ReviewFileSnapshot): FileReviewStatus
  onToggleDirectory(directoryPath: string): void
  onSelect(filePath: string): void
}): JSX.Element {
  return (
    <ul class="space-y-0.5">
      <For each={props.nodes}>
        {(node) => {
          if (node.kind === 'directory') {
            const collapsed = () => props.collapsedDirectoryPaths.has(node.directoryPath)
            return (
              <li>
                <button
                  type="button"
                  class={
                    'flex w-full items-center gap-1 px-2 py-1 font-mono text-[10px]' +
                    ' font-medium text-muted-foreground' +
                    ' hover:bg-accent/60'
                  }
                  onClick={() => props.onToggleDirectory(node.directoryPath)}
                  aria-expanded={!collapsed() ? 'true' : 'false'}
                  data-testid="diff-review-directory"
                  data-directory-path={node.directoryPath}
                >
                  <Show when={!collapsed()} fallback={<ChevronRight size={11} class="shrink-0" />}>
                    <ChevronDown size={11} class="shrink-0" />
                  </Show>
                  <FolderOpen size={13} class="shrink-0" />
                  <span class="whitespace-nowrap">{node.name}</span>
                </button>
                <Show when={!collapsed()}>
                  <div class="ml-3 border-l border-border/70 pl-1">
                    <FileTreeNodes {...props} nodes={node.children} />
                  </div>
                </Show>
              </li>
            )
          }
          const file = () => props.fileForPath(node.filePath)
          return (
            <Show when={file()}>
              {(current) => (
                <li>
                  <button
                    type="button"
                    class={`flex w-full items-start gap-1.5 rounded-md px-2 py-1.5 text-left ${props.activePath === node.filePath ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'}`}
                    onClick={() => props.onSelect(node.filePath)}
                    data-testid="diff-review-file"
                    data-file-path={node.filePath}
                    title={node.filePath}
                  >
                    <Show when={!current().binary} fallback={<FileWarning size={13} class="mt-0.5 shrink-0 text-warning" />}>
                      <FileCode2 size={13} class="mt-0.5 shrink-0 text-muted-foreground" />
                    </Show>
                    <span class="min-w-max flex-1">
                      <span class="flex items-center gap-1.5 whitespace-nowrap">
                        <ReviewStateIcon status={props.statusFor(current())} />
                        <span class="font-mono text-[10px] font-medium">{node.name}</span>
                      </span>
                      <span class="mt-0.5 block whitespace-nowrap pl-[19px] font-mono text-[9px]">
                        <span class="text-success">+{current().additions}</span>
                        <span class="ml-2 text-destructive">-{current().deletions}</span>
                        <Show when={current().binary}>
                          <span class="ml-2 text-warning">BINARY</span>
                        </Show>
                      </span>
                    </span>
                  </button>
                </li>
              )}
            </Show>
          )
        }}
      </For>
    </ul>
  )
}
