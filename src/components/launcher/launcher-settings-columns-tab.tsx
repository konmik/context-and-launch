import type { JSX } from '@solidjs/web'
import type { Result } from '../../util/result.js'
import { Show, For, createSignal, createEffect, useContext } from 'solid-js'
import { revalidate } from '@solidjs/router'
import { DragDropProvider } from '~/components/drag/drag-provider.js'
import { TabsContent } from '../ui/tabs'
import type { ColumnDefinition } from '~/core/project/board-config-data.js'
import type { BoardRef } from '../board/board-api.js'
import { BoardConfigContext } from '../board/board-config-storage.js'
import { AppConfigContext } from '../config/app-config-storage.js'
import type { ErrorInfo } from '~/core/shared/errors.js'
import { NameDragOverlay } from '../board/dnd-shared.js'
import { createListReorder } from '../board/list-reorder.js'
import { SortableColumnRow, ColumnDropPreview } from './launcher-settings-rows.js'
import BoardSelect from '../project/BoardSelect.js'
import { ErrorScope, useErrorReporter } from '../shared/error-presentation.js'
import { updateBoardColumns } from './launcher-settings-pure.js'
import {
  ColumnFormDialog,
  CreateBoardDialog,
  DeleteConfirmDialog,
  ProjectBoardConfirmDialog,
  type ColumnFormState,
  type DeleteTarget,
} from './launcher-settings-dialogs.js'

export function ColumnsTab(props: { open: boolean; projectSlug: string }): JSX.Element {
  return <ErrorScope active={props.open}><ColumnsTabContent {...props} /></ErrorScope>
}

function ColumnsTabContent(props: { open: boolean; projectSlug: string }): JSX.Element {
  const storage = useContext(BoardConfigContext)!
  const errors = useErrorReporter(() => props.open)
  const appConfig = useContext(AppConfigContext)!
  const boards = storage.get
  const projectBoardId = () => appConfig.get().projects.find((p) => p.projectSlug === props.projectSlug)?.boardId
  const [boardOverride, setBoardOverride] = createSignal<string>()
  const selectedBoard = () =>
    boards().find((b) => b.id === boardOverride()) ?? boards().find((b) => b.id === projectBoardId()) ?? boards()[0]
  const [columnForm, setColumnForm] = createSignal<ColumnFormState | null>(null)
  const [boardFormOpen, setBoardFormOpen] = createSignal(false)
  const [deleteConfirm, setDeleteConfirm] = createSignal<DeleteTarget | null>(null)
  const [projectBoardConfirm, setProjectBoardConfirm] = createSignal<BoardRef | null>(null)
  createEffect(
    () => [props.open, props.projectSlug],
    () => {
      setBoardOverride(undefined)
      setColumnForm(null)
      setBoardFormOpen(false)
      setDeleteConfirm(null)
      setProjectBoardConfirm(null)
      errors.clear()
    },
  )

  async function updateColumns(transform: (columns: ColumnDefinition[]) => ColumnDefinition[]): Promise<Result<void, ErrorInfo>> {
    const id = selectedBoard().id
    return storage.update((current) => updateBoardColumns(current, id, transform))
  }

  async function deleteSelected() {
    const target = deleteConfirm()
    if (!target) return
    const result =
      target.type === 'column'
        ? await updateColumns((columns) => columns.filter((c) => c.name !== target.id))
        : await storage.update((current) => {
            if (current.length <= 1) throw new Error('Cannot delete the last board')
            return current.filter((b) => b.id !== target.id)
          })
    setDeleteConfirm(null)
    if (result.type === 'Failure') {
      errors.report(result.error)
      return
    }
    if (target.type === 'board') {
      const cleared = await appConfig.update((current) => ({
        ...current,
        projects: current.projects.map((project) => {
          if (project.boardId !== target.id) return project
          const { boardId: _, ...rest } = project
          return rest
        }),
      }))
      if (cleared.type === 'Failure')
        errors.report(cleared.error)
      await revalidate('project-page')
    }
  }

  async function setProjectBoard() {
    const board = projectBoardConfirm()
    if (!board) return
    const projectSlug = props.projectSlug
    const result = await appConfig.update((current) => ({
      ...current,
      projects: current.projects.map((project) =>
        project.projectSlug === projectSlug
          ? {
              ...project,
              boardId: board.id,
            }
          : project,
      ),
    }))
    if (result.type === 'Failure') {
      errors.report(result.error)
      return
    }
    setProjectBoardConfirm(null)
    await revalidate('project-page')
  }

  const columnReorder = createListReorder<ColumnDefinition>({
    items: () => selectedBoard().columns,
    idOf: (c) => c.name,
    onReorder: async (names) => {
      const result = await updateColumns((columns) => {
        const byName = new Map(columns.map((column) => [column.name, column]))
        if (names.length !== columns.length || new Set(names).size !== columns.length || names.some((name) => !byName.has(name))) {
          throw new Error('Ordered names must match existing column names exactly')
        }
        return names.map((name) => byName.get(name)!)
      })
      if (result.type === 'Failure')
        errors.report(result.error)
    },
  })
  return (
    <>
      <TabsContent value="columns">
        <div class="space-y-6">
          <section>
            <div class="mb-2 flex items-center gap-2">
              <BoardSelect
                boards={boards()}
                value={selectedBoard().id}
                onChange={(e) => setBoardOverride(e.currentTarget.value)}
                class="input input-sm flex-1"
                testId="launcher-settings-columns-board-selector"
              />
              <button
                onClick={() => {
                  const b = selectedBoard()
                  setProjectBoardConfirm({
                    id: b.id,
                    name: b.name,
                  })
                }}
                disabled={projectBoardId() === selectedBoard().id}
                class="btn-secondary btn-sm"
                data-testid="launcher-settings-columns-set-project-board-btn"
              >
                Set as project board
              </button>
              <button
                onClick={() => {
                  errors.clear()
                  setBoardFormOpen(true)
                }}
                class="btn-primary btn-sm"
                data-testid="launcher-settings-columns-add-board-btn"
              >
                Add Board
              </button>
              <button
                onClick={() => {
                  const b = selectedBoard()
                  if (b) {
                    errors.clear()
                    setDeleteConfirm({
                      type: 'board',
                      id: b.id,
                      name: b.name,
                    })
                  }
                }}
                disabled={boards().length <= 1}
                class={'btn-secondary btn-sm text-destructive ' + 'hover:bg-destructive hover:text-destructive-foreground'}
                data-testid="launcher-settings-columns-delete-board-btn"
              >
                Delete Board
              </button>
            </div>
          </section>
          <section>
            <div class="mb-2 flex items-center justify-between">
              <h3 class="text-sm font-semibold">Columns</h3>
              <button
                onClick={() => {
                  errors.clear()
                  setColumnForm({
                    mode: 'add',
                    name: '',
                    description: '',
                    color: '',
                  })
                }}
                class="btn-primary btn-sm"
                data-testid="launcher-settings-columns-add-column-btn"
              >
                Add
              </button>
            </div>
            <Show when={selectedBoard()}>
              {(_) => {
                const board = selectedBoard
                return (
                  <Show
                    when={board().columns.length > 0}
                    fallback={<p class="py-3 text-center text-sm text-muted-foreground">No columns. Add one to get started.</p>}
                  >
                    <DragDropProvider
                      onDragStart={columnReorder.onDragStart}
                      onDragOver={columnReorder.onDragOver}
                      onDragEnd={columnReorder.onDragEnd}
                    >
                      <div class="space-y-2">
                        <For each={board().columns}>
                          {(col, i) => (
                            <>
                              <Show when={columnReorder.dropPreview()?.insertBefore === i()}>
                                <ColumnDropPreview column={columnReorder.dropPreview()!.item} />
                              </Show>
                              <SortableColumnRow
                                column={col}
                                isActive={columnReorder.activeId() === col.name}
                                onEdit={() => {
                                  errors.clear()
                                  setColumnForm({
                                    mode: 'edit',
                                    name: col.name,
                                    description: col.description ?? '',
                                    color: col.color ?? '',
                                    oldName: col.name,
                                  })
                                }}
                                onDelete={() => {
                                  errors.clear()
                                  setDeleteConfirm({
                                    type: 'column',
                                    id: col.name,
                                    name: col.name,
                                  })
                                }}
                              />
                            </>
                          )}
                        </For>
                        <Show when={columnReorder.dropPreview()?.insertBefore === board().columns.length}>
                          <ColumnDropPreview column={columnReorder.dropPreview()!.item} />
                        </Show>
                      </div>
                      <NameDragOverlay nameOf={(id) => board().columns.find((c) => c.name === id)?.name} />
                    </DragDropProvider>
                  </Show>
                )
              }}
            </Show>
          </section>
        </div>
      </TabsContent>
      <ColumnFormDialog
        form={props.open ? columnForm() : undefined}
        boardId={selectedBoard().id}
        projectSlug={props.projectSlug}
        onClose={() => setColumnForm(null)}
      />
      <CreateBoardDialog open={boardFormOpen()} onOpenChange={setBoardFormOpen} onCreated={setBoardOverride} />
      <DeleteConfirmDialog
        deleteConfirm={deleteConfirm()}
        setDeleteConfirm={setDeleteConfirm}
        onDeleteBoard={deleteSelected}
        onDeleteColumn={deleteSelected}
      />
      <ProjectBoardConfirmDialog
        projectBoardConfirm={projectBoardConfirm()}
        setProjectBoardConfirm={setProjectBoardConfirm}
        onConfirm={setProjectBoard}
      />
    </>
  )
}
