import type { JSX } from '@solidjs/web'
import { For, createMemo, createSignal } from 'solid-js'
import type { DiffScope, ReviewFileSnapshot } from '~/core/diff-review/diff-review-types.js'
import { type DiffReviewFileTreeNode } from './diff-review-file-tree.js'
import { buildFileTypeTotals } from './diff-review-file-type-totals.js'
import { type FileReviewStatus } from './file-review-status.js'
import { FileTreeNodes } from './FileTreeNodes.js'

export function FileTree(props: {
  files: ReviewFileSnapshot[]
  nodes: DiffReviewFileTreeNode[]
  loadedScope?: DiffScope
  activePath: string
  width: number
  statusFor(file: ReviewFileSnapshot): FileReviewStatus
  onSelect(filePath: string): void
}): JSX.Element {
  const [collapsedDirectoryPaths, setCollapsedDirectoryPaths] = createSignal(new Set<string>())
  const fileByPath = createMemo(() => new Map(props.files.map((file) => [file.path, file])))
  const totalsByFileType = createMemo(() => buildFileTypeTotals(props.files))

  function toggleDirectory(directoryPath: string) {
    setCollapsedDirectoryPaths((current) => {
      const next = new Set(current)
      if (next.has(directoryPath)) next.delete(directoryPath)
      else next.add(directoryPath)
      return next
    })
  }

  return (
    <nav
      style={{
        width: `${props.width}px`,
      }}
      class="flex min-h-0 shrink-0 flex-col border-r border-border bg-card/35"
      aria-label="Changed files"
      data-testid="diff-review-file-tree"
      data-loaded-scope={props.loadedScope}
    >
      <div class="shrink-0 p-3 pb-0">
        <div class="px-2 font-mono text-[10px] font-bold tracking-[0.12em] text-muted-foreground">CHANGED FILES · {props.files.length}</div>
      </div>
      <div class="min-h-0 flex-1 overflow-auto p-3 pt-2" data-testid="diff-review-file-tree-scroll">
        <FileTreeNodes
          nodes={props.nodes}
          activePath={props.activePath}
          collapsedDirectoryPaths={collapsedDirectoryPaths()}
          fileForPath={(filePath) => fileByPath().get(filePath)}
          statusFor={props.statusFor}
          onToggleDirectory={toggleDirectory}
          onSelect={props.onSelect}
        />
      </div>
      <footer class="shrink-0 border-t border-border/70 p-3">
        <div class="px-2 font-mono text-[10px] font-bold tracking-[0.12em] text-muted-foreground">LINE CHANGES BY TYPE</div>
        <ul class="mt-1.5" data-testid="diff-review-file-type-totals">
          <For each={totalsByFileType()}>
            {(totals) => (
              <li class="flex items-baseline justify-between gap-2 px-2 py-0.5 font-mono text-[10px]" data-file-type={totals.fileType}>
                <span class="min-w-0 truncate text-muted-foreground">{totals.fileType}</span>
                <span class="ml-auto whitespace-nowrap tabular-nums">
                  <span class="text-success">+{totals.additions}</span>
                  <span class="ml-2 text-destructive">-{totals.deletions}</span>
                </span>
              </li>
            )}
          </For>
        </ul>
      </footer>
    </nav>
  )
}
