import { Show, For, createSignal, createEffect, useContext } from "solid-js";
import { revalidate } from '@solidjs/router';
import { DragDropProvider } from "~/components/drag/drag-provider.js";
import { TabsContent } from "../ui/tabs";
import { validateColumnName, type ColumnDefinition } from '~/core/project/board-config-data.js';
import { migrateRenamedColumn, type BoardRef } from '../board/board-api.js';
import { BoardConfigContext } from '../board/board-config-storage.js';
import { AppConfigContext } from '../config/app-config-storage.js';
import { slugifyColumnName } from '~/lib/slugify.js';
import { errorMessage, type ErrorInfo } from '~/core/shared/errors.js';
import { useModEnterSubmit } from '~/lib/use-mod-enter-submit.js';
import { NameDragOverlay } from "../board/dnd-shared.js";
import { createListReorder } from '../board/list-reorder.js';
import { SortableColumnRow, ColumnDropPreview } from "./launcher-settings-rows.js";
import BoardSelect from "../project/BoardSelect.js";
import ErrorDialog from '../shared/ErrorDialog.js';
import { ProjectLauncherConfigContext } from './project-launcher-config-storage.js';
import {
	ColumnFormDialog, RenameColumnDialog, BoardFormDialog, DeleteConfirmDialog, ProjectBoardConfirmDialog,
	type ColumnFormState, type DeleteTarget, type RenameFormState,
} from './launcher-settings-dialogs.js';
import { validateColumnName as columnValidation } from './launcher-settings-pure.js';

export function ColumnsTab(props: {
	open: boolean;
	projectSlug: string;
}) {
	const storage = useContext(BoardConfigContext)!;
	const projectConfig = useContext(ProjectLauncherConfigContext)!;
	const [error, setError] = createSignal<ErrorInfo | null>(null);
	const appConfig = useContext(AppConfigContext)!;
	const boards = storage.get;
	const projectBoardId = () => appConfig.get().projects.find(p => p.projectSlug === props.projectSlug)?.boardId;
	const [boardOverride, setBoardOverride] = createSignal<string>();
	const selectedBoard = () => boards().find(b => b.id === boardOverride())
		?? boards().find(b => b.id === projectBoardId()) ?? boards()[0];
	const [columnForm, setColumnForm] = createSignal<ColumnFormState | null>(null);
	const [boardForm, setBoardForm] = createSignal<{ name: string } | null>(null);
	const [renameForm, setRenameForm] = createSignal<RenameFormState | null>(null);
	const [deleteConfirm, setDeleteConfirm] = createSignal<DeleteTarget | null>(null);
	const [projectBoardConfirm, setProjectBoardConfirm] = createSignal<BoardRef | null>(null);
	const [columnDialogError, setColumnDialogError] = createSignal('');
	createEffect(() => [props.open, props.projectSlug], () => {
		setBoardOverride(undefined); setColumnForm(null); setBoardForm(null);
		setRenameForm(null); setDeleteConfirm(null); setProjectBoardConfirm(null); setColumnDialogError('');
	});
	const validation = () => {
		const f = columnForm();
		return f ? columnValidation(f.name, f.mode, f.oldName, selectedBoard().columns) : '';
	};
	async function updateColumns(transform: (columns: ColumnDefinition[]) => ColumnDefinition[]) {
		const id = selectedBoard().id;
		return storage.update(current => {
			if (!current.some(b => b.id === id)) throw new Error(`Board not found: ${id}`);
			return current.map(b => b.id === id ? { ...b, columns: transform(b.columns) } : b);
		});
	}
	async function createBoard() {
		const f = boardForm(); if (!f) return;
		const id = slugifyColumnName(f.name);
		const result = await storage.update(current => {
			if (!id) throw new Error('Board name must not be empty');
			if (id === 'undefined') throw new Error('Board name "undefined" is reserved');
			if (current.some(b => b.id === id)) throw new Error(`Board with id "${id}" already exists`);
			return [...current, { id, name: f.name.trim(), columns: [] }];
		});
		if (result.type === 'Failure') { setColumnDialogError(result.error); return; }
		setBoardForm(null); setBoardOverride(id);
	}
	async function saveColumn(f = columnForm(), rename = renameForm()) {
		if (!f) return;
		setColumnDialogError('');
		if (f.mode === 'edit' && slugifyColumnName(f.name) !== f.oldName && !rename) {
			setRenameForm({ oldName: f.oldName!, newName: f.name, scope: 'all' }); return;
		}
		const boardId = selectedBoard().id;
		const projectSlug = props.projectSlug;
		const newName = slugifyColumnName(rename?.newName ?? f.name);
		const result = await updateColumns(columns => {
			validateColumnName(newName, columns.map(c => c.name), f.oldName);
			const content = {
				name: newName, description: f.description.trim() || undefined, color: f.color || undefined,
			};
			if (f.mode === 'add') return [...columns, content];
			if (!columns.some(c => c.name === f.oldName)) throw new Error(`Column not found: ${f.oldName}`);
			return columns.map(c => c.name === f.oldName ? { ...c, ...content } : c);
		});
		if (result.type === 'Failure') { setColumnDialogError(result.error); return; }
		setColumnForm(null); setRenameForm(null);
		if (rename && rename.scope !== 'none') {
			try {
				if (rename.scope === 'current' || boardId === (projectBoardId() ?? boards()[0]?.id)) {
					const migrated = await projectConfig.update(current => {
						if (!current.columnDefaults || !Object.hasOwn(current.columnDefaults, rename.oldName)) {
							return current;
						}
						const { [rename.oldName]: defaults, ...remaining } = current.columnDefaults;
						return { ...current, columnDefaults: { ...remaining, [newName]: defaults } };
					});
					if (migrated.type === 'Failure') throw new Error(migrated.error);
				}
				const migration = await migrateRenamedColumn(
					boardId, rename.oldName, newName, rename.scope, projectSlug,
				);
				if (migration.type === 'Failure') throw new Error(migration.error);
				await revalidate('project-page');
			} catch (error) {
				const rollback = await storage.update(current => current.map(board => board.id === boardId
					? { ...board, columns: board.columns.map(column => column.name === newName
						? { ...column, name: rename.oldName } : column) } : board));
				setError({ title: 'Migration failed', description: errorMessage(error)
					+ (rollback.type === 'Failure' ? `; rollback failed: ${rollback.error}` : '') });
			}
		}
	}
	async function deleteSelected() {
		const target = deleteConfirm(); if (!target) return;
		const result = target.type === 'column'
			? await updateColumns(columns => columns.filter(c => c.name !== target.id))
			: await storage.update(current => {
				if (current.length <= 1) throw new Error('Cannot delete the last board');
				return current.filter(b => b.id !== target.id);
			});
		setDeleteConfirm(null);
		if (result.type === 'Failure') { setError({ title: 'Delete failed', description: result.error }); return; }
		if (target.type === 'board') {
			const cleared = await appConfig.update(current => ({ ...current, projects: current.projects.map(project => {
				if (project.boardId !== target.id) return project;
				const { boardId: _, ...rest } = project;
				return rest;
			}) }));
			if (cleared.type === 'Failure') setError({ title: 'Delete failed', description: cleared.error });
			await revalidate('project-page');
		}
	}
	async function setProjectBoard() {
		const board = projectBoardConfirm(); if (!board) return;
		const projectSlug = props.projectSlug;
		const result = await appConfig.update(current => ({ ...current, projects: current.projects.map(project =>
			project.projectSlug === projectSlug ? { ...project, boardId: board.id } : project) }));
		if (result.type === 'Failure') { setError({ title: 'Save failed', description: result.error }); return; }
		setProjectBoardConfirm(null);
		await revalidate('project-page');
	}
	const columnReorder = createListReorder<ColumnDefinition>({
		items: () => selectedBoard().columns, idOf: c => c.name,
		onReorder: async names => {
			const result = await updateColumns(columns => {
				if (names.length !== columns.length || new Set(names).size !== columns.length
					|| columns.some(c => !names.includes(c.name))) {
					throw new Error('Ordered names must match existing column names exactly');
				}
				return names.map(name => columns.find(c => c.name === name)!);
			});
			if (result.type === 'Failure') setError({ title: 'Reorder failed', description: result.error });
		},
	});
	useModEnterSubmit({
		onSubmit: () => saveColumn(), disabled: () => !columnForm()?.name.trim() || !!validation(),
		active: () => !!columnForm() && !renameForm(),
	});
	useModEnterSubmit({ onSubmit: () => saveColumn(), disabled: () => false, active: () => !!renameForm() });
	useModEnterSubmit({
		onSubmit: createBoard, disabled: () => !boardForm()?.name.trim(), active: () => !!boardForm(),
	});
	return (<>
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
								const b = selectedBoard();
								setProjectBoardConfirm({ id: b.id, name: b.name });
							}}
							disabled={projectBoardId() === selectedBoard().id}
							class="btn-secondary btn-sm"
							data-testid="launcher-settings-columns-set-project-board-btn"
						>Set as project board</button>
						<button
							onClick={() => { setColumnDialogError(""); setBoardForm({ name: "" }); }}
							class="btn-primary btn-sm"
							data-testid="launcher-settings-columns-add-board-btn"
						>Add Board</button>
						<button
							onClick={() => {
								const b = selectedBoard();
								if (b) {
									setColumnDialogError("");
									setDeleteConfirm({
										type: "board", id: b.id, name: b.name,
									});
								}
							}}
							disabled={boards().length <= 1}
							class={
								"btn-secondary btn-sm text-destructive "
								+ "hover:bg-destructive hover:text-destructive-foreground"
							}
							data-testid="launcher-settings-columns-delete-board-btn"
						>Delete Board</button>
					</div>
				</section>
				<section>
					<div class="mb-2 flex items-center justify-between">
						<h3 class="text-sm font-semibold">Columns</h3>
						<button
							onClick={() => {
								setColumnDialogError("");
								setColumnForm({
									mode: "add", name: "", description: "", color: "",
								});
							}}
							class="btn-primary btn-sm"
							data-testid="launcher-settings-columns-add-column-btn"
						>Add</button>
					</div>
					<Show when={selectedBoard()}>
						{(_) => {
							const board = selectedBoard;
							return (
							<Show
								when={board().columns.length > 0}
								fallback={
									<p class="py-3 text-center text-sm text-muted-foreground">
										No columns. Add one to get started.
									</p>
								}
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
														<Show when={
															columnReorder.dropPreview()?.insertBefore === i()
														}>
															<ColumnDropPreview
																column={columnReorder.dropPreview()!.item}
															/>
														</Show>
														<SortableColumnRow
															column={col}
															isActive={columnReorder.activeId() === col.name}
															onEdit={() => {
																setColumnDialogError("");
																setColumnForm({
																	mode: "edit",
																	name: col.name,
																	description: col.description ?? "",
																	color: col.color ?? "",
																	oldName: col.name,
																});
															}}
															onDelete={() => {
															setColumnDialogError("");
															setDeleteConfirm({
																type: "column",
																id: col.name,
																name: col.name,
															});
														}}
														/>
													</>
												)}
											</For>
											<Show when={
												columnReorder.dropPreview()?.insertBefore
													=== board().columns.length
											}>
												<ColumnDropPreview
													column={columnReorder.dropPreview()!.item}
												/>
											</Show>
									</div>
									<NameDragOverlay nameOf={
										(id) => board().columns.find(c => c.name === id)?.name
									} />
								</DragDropProvider>
							</Show>
							);
						}}
					</Show>
				</section>
			</div>
		</TabsContent>
		<ErrorDialog error={error()} onClose={() => setError(null)} />
		<ColumnFormDialog columnForm={columnForm()} setColumnForm={setColumnForm} renameActive={!!renameForm()}
			columnError={columnDialogError()} validation={validation()} onSubmit={f => saveColumn(f)} />
		<RenameColumnDialog renameForm={renameForm()} setRenameForm={setRenameForm}
			columnError={columnDialogError()} onRename={f => saveColumn(columnForm(), f)} />
		<BoardFormDialog boardForm={boardForm()} setBoardForm={setBoardForm}
			columnError={columnDialogError()} onCreate={createBoard} />
		<DeleteConfirmDialog deleteConfirm={deleteConfirm()} setDeleteConfirm={setDeleteConfirm}
			onDeleteBoard={deleteSelected} onDeleteColumn={deleteSelected} />
		<ProjectBoardConfirmDialog projectBoardConfirm={projectBoardConfirm()}
			setProjectBoardConfirm={setProjectBoardConfirm} onConfirm={setProjectBoard} />
	</>);
}
