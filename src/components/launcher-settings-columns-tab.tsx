import { Show, For } from "solid-js";
import { DragDropProvider, DragDropSensors, SortableProvider, closestCenter } from "@thisbeyond/solid-dnd";
import { TabsContent } from "./ui/tabs";
import type { MergedLauncherConfig } from "~/server/launcher/launcher-config.js";
import type { BoardDefinition, ColumnDefinition } from "~/server/project/board-config.js";
import { NameDragOverlay } from "./dnd-shared.js";
import type { ListReorder } from "./list-reorder.js";
import { BoardOptions, SortableColumnRow, ColumnDropPreview } from "./launcher-settings-rows.js";
import type { ColumnFormState, DeleteTarget } from "./launcher-settings-dialogs.js";

export function ColumnsTab(props: {
	config: MergedLauncherConfig;
	boards: BoardDefinition[];
	columnError: string;
	setColumnError: (v: string) => void;
	selectedBoardId: string;
	selectedBoard: BoardDefinition | undefined;
	columnReorder: ListReorder<ColumnDefinition>;
	setBoardOverride: (v: string) => void;
	onProjectBoard: (b: { id: string; name: string }) => void;
	setBoardForm: (v: { name: string } | null) => void;
	setColumnForm: (v: ColumnFormState | null) => void;
	setDeleteConfirm: (v: DeleteTarget | null) => void;
}) {
	return (
		<TabsContent value="columns">
			<div class="space-y-6">
				<Show when={props.columnError}><div class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{props.columnError}</div></Show>
				<section>
					<div class="mb-2 flex items-center gap-2">
						<select
							onChange={(e) => props.setBoardOverride(e.currentTarget.value)}
							class="input input-sm flex-1"
							data-testid="board-selector"
						>
							<BoardOptions boards={props.boards} selectedId={props.selectedBoardId} />
						</select>
						<button
							onClick={() => { const b = props.selectedBoard; if (b) props.onProjectBoard({ id: b.id, name: b.name }); }}
							disabled={props.config.boardId === props.selectedBoardId}
							class="btn-secondary btn-sm"
							data-testid="set-project-board-btn"
						>Set as project board</button>
						<button onClick={() => props.setBoardForm({ name: "" })} class="btn-primary btn-sm" data-testid="add-board-btn">Add Board</button>
						<button
							onClick={() => { const b = props.selectedBoard; if (b) props.setDeleteConfirm({ type: "board", id: b.id, name: b.name }); }}
							disabled={props.boards.length <= 1}
							class="btn-secondary btn-sm text-destructive hover:bg-destructive hover:text-destructive-foreground"
							data-testid="delete-board-btn"
						>Delete Board</button>
					</div>
				</section>
				<section>
					<div class="mb-2 flex items-center justify-between">
						<h3 class="text-sm font-semibold">Columns</h3>
						<button onClick={() => { props.setColumnError(""); props.setColumnForm({ mode: "add", name: "", description: "" }); }} class="btn-primary btn-sm" data-testid="add-column-btn">Add</button>
					</div>
					<Show when={props.selectedBoard}>
						{(board) => (
							<Show when={board().columns.length > 0} fallback={<p class="py-3 text-center text-sm text-muted-foreground">No columns. Add one to get started.</p>}>
								<DragDropProvider
									onDragStart={props.columnReorder.onDragStart}
									onDragOver={props.columnReorder.onDragOver}
									onDragEnd={props.columnReorder.onDragEnd}
									collisionDetector={closestCenter}
								>
									<DragDropSensors />
									<SortableProvider ids={board().columns.map(c => c.name)}>
										<div class="space-y-2">
											<For each={board().columns}>
												{(col, i) => (
													<>
														<Show when={props.columnReorder.dropPreview()?.insertBefore === i()}>
															<ColumnDropPreview column={props.columnReorder.dropPreview()!.item} />
														</Show>
														<SortableColumnRow
															column={col}
															isActive={props.columnReorder.activeId() === col.name}
															onEdit={() => { props.setColumnError(""); props.setColumnForm({ mode: "edit", name: col.name, description: col.description ?? "", oldName: col.name }); }}
															onDelete={() => props.setDeleteConfirm({ type: "column", id: col.name, name: col.name })}
														/>
													</>
												)}
											</For>
											<Show when={props.columnReorder.dropPreview()?.insertBefore === board().columns.length}>
												<ColumnDropPreview column={props.columnReorder.dropPreview()!.item} />
											</Show>
										</div>
									</SortableProvider>
									<NameDragOverlay nameOf={(id) => board().columns.find(c => c.name === id)?.name} />
								</DragDropProvider>
							</Show>
						)}
					</Show>
				</section>
			</div>
		</TabsContent>
	);
}
