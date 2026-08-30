import { createSignal, createEffect, createMemo, flush } from "solid-js";
import { revalidate, useAction } from "@solidjs/router";
import type {
  LauncherItemType,
  MergedLauncherConfig,
} from "~/core/launcher/launcher-config.js";
import type { BoardDefinition, ColumnDefinition } from "~/core/project/board-config.js";
import { errorPayload, errorMessage, type ErrorInfo } from "~/core/shared/errors.js";
import { slugifyColumnName } from "~/lib/slugify.js";
import {
  getMergedLauncherConfig, type MergedLauncherConfigWithMeta,
  addItem, updateItem, deleteItem as deleteItemAction,
  reorderItem, saveWorktreeRootPath as saveWorktreeRootPathAction,
  saveBranchPrefix as saveBranchPrefixAction,
  saveConflictResolution as saveConflictResolutionAction,
} from "./launcher-api.js";
import {
  listBoards, createBoard, deleteBoard, addColumn, updateColumn,
  deleteColumn, renameColumn, reorderColumns,
} from "../board/board-api.js";
import { setProjectName as setProjectNameAction, setBoardId as setBoardIdAction } from "../project/project-api.js";
import { createListReorder, midpointOrder } from "../board/list-reorder.js";
import type {
  ItemType, Scope, ItemFormState, ColumnFormState,
  RenameFormState, DeleteTarget,
} from "./launcher-settings-dialogs.js";
import { validateColumnName, buildFormPayload } from "./launcher-settings-pure.js";
import type { BoardRef } from "../board/board-api.js";

function columnContentPatch(cf: ColumnFormState) {
	return { description: cf.description, color: cf.color };
}

export function createLauncherSettingsState(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projectSlug: string;
}) {
	const [config, setConfig] = createSignal<MergedLauncherConfig | null>(null);
	const [loading, setLoading] = createSignal(false);
	const [error, setError] = createSignal<ErrorInfo | null>(null);
	const [form, setForm] = createSignal<ItemFormState | null>(null);
	const [projectName, setProjectName] = createSignal("");
	const [worktreeRootPath, setWorktreeRootPath] = createSignal("");
	const [branchPrefix, setBranchPrefix] = createSignal<string | undefined>(undefined);
	const [conflictPrompt, setConflictPrompt] = createSignal("");
	const [activeTab, setActiveTab] = createSignal<string>("profiles");
	const [boards, setBoards] = createSignal<BoardDefinition[]>([]);
	const [projectBoardId, setProjectBoardId] = createSignal<string | null>(null);
	const [boardOverride, setBoardOverride] = createSignal<string | null>(null);
	const [columnForm, setColumnForm] = createSignal<ColumnFormState | null>(null);
	const [boardForm, setBoardForm] = createSignal<{ name: string } | null>(null);
	const [renameForm, setRenameForm] = createSignal<RenameFormState | null>(null);
	const [deleteConfirm, setDeleteConfirm] = createSignal<DeleteTarget | null>(null);
	const [projectBoardConfirm, setProjectBoardConfirm] = createSignal<BoardRef | null>(null);
	const [columnDialogError, setColumnDialogError] = createSignal("");
	const runAddItem = useAction(addItem);
	const runUpdateItem = useAction(updateItem);
	const runDeleteItem = useAction(deleteItemAction);
	const runCreateBoard = useAction(createBoard);
	const runDeleteBoard = useAction(deleteBoard);
	const runAddColumn = useAction(addColumn);
	const runUpdateColumn = useAction(updateColumn);
	const runDeleteColumn = useAction(deleteColumn);
	const runRenameColumn = useAction(renameColumn);
	const runReorderColumns = useAction(reorderColumns);

	const selectedBoardId = createMemo(() => {
		const list = boards();
		const valid = (id: string | null | undefined) => (id && list.some(b => b.id === id) ? id : null);
		return valid(boardOverride()) ?? valid(projectBoardId()) ?? list[0]?.id ?? "";
	});

	const selectedBoard = () => boards().find(b => b.id === selectedBoardId());

	createEffect(() => props.open, (open) => {
		if (!open) return;
		setBoardOverride(null); setForm(null);
			setColumnForm(null); setBoardForm(null); setRenameForm(null);
			setDeleteConfirm(null); setProjectBoardConfirm(null);
		setError(null); setColumnDialogError("");
		loadConfig();
	});

	function applyConfig(data: MergedLauncherConfigWithMeta) {
		setConfig(data);
			setProjectBoardId(data.projectBoardId ?? null);
			setProjectName(data.projectName ?? "");
			setWorktreeRootPath(data.worktreeRootPath ?? "");
			setBranchPrefix(data.branchPrefix);
		setConflictPrompt(data.conflictResolutionPrompt ?? "");
	}

	async function loadConfig() {
		setLoading(true); setError(null);
		const [configResult, boardsResult] = await Promise.allSettled([
			(async () => {
				await revalidate("launcher-config");
				return getMergedLauncherConfig(props.projectSlug);
			})(),
			(async () => {
				await revalidate("boards");
				return listBoards();
			})(),
		]);
		if (configResult.status === "fulfilled") applyConfig(configResult.value);
		else setError(errorPayload(configResult.reason, "Load failed"));
		if (boardsResult.status === "fulfilled") setBoards(boardsResult.value);
		else setError(errorPayload(boardsResult.reason, "Load failed"));
		setLoading(false);
	}

	async function loadBoards() {
		try {
			await revalidate("boards");
			setBoards(await listBoards());
		} catch (e) {
			setError(errorPayload(e, "Load failed"));
		}
	}

	function startAdd(itemType: ItemType) {
		setForm({ mode: "add", itemType, scope: "app", name: "", text: "" });
	}
	function startEdit(
		itemType: ItemType, scope: Scope, name: string, text: string,
	) {
		setForm({ mode: "edit", itemType, scope, name, text, oldName: name });
	}

	async function submitForm(submittedForm?: ItemFormState) {
		const f = submittedForm ?? form();
		if (!f || !f.name.trim()) return;
		setError(null);
		try {
			const payload = buildFormPayload(f);
			const usesCommand = f.itemType === "profile" || f.itemType === "shortcut";
			const fields = usesCommand
				? { name: payload.name!, command: payload.command ?? payload.text }
				: { name: payload.name!, text: payload.text };
			if (f.mode === "add") {
				const input = {
					projectSlug: props.projectSlug, itemType: f.itemType, scope: f.scope, fields,
				};
				const result = await runAddItem(input);
				if (!result.ok) { setError({ title: "Save failed", description: result.message }); return; }
			} else {
				const result = await runUpdateItem({
					projectSlug: props.projectSlug, itemType: f.itemType, scope: f.scope,
					oldName: f.oldName!, fields,
				});
				if (!result.ok) { setError({ title: "Save failed", description: result.message }); return; }
			}
			setForm(null); await loadConfig();
		} catch (e) { setError(errorPayload(e, "Save failed")); }
	}

	async function deleteItemFn(itemType: ItemType, scope: Scope, name: string) {
		setError(null);
		try {
			const result = await runDeleteItem({
				projectSlug: props.projectSlug, itemType, scope, name,
			});
			if (!result.ok) { setError({ title: "Delete failed", description: result.message }); return; }
			await loadConfig();
		} catch (e) { setError(errorPayload(e, "Delete failed")); }
	}

	async function saveProjectNameFn() {
		setError(null);
		try {
			const result = await setProjectNameAction(props.projectSlug, projectName());
			if (!result.ok) setError({ title: "Save failed", description: result.message });
		} catch (e) { setError(errorPayload(e, "Save failed")); }
	}

	async function saveWorktreeRootPathFn(path = worktreeRootPath()) {
		setError(null);
		try {
			const result = await saveWorktreeRootPathAction(props.projectSlug, path);
			if (!result.ok) { setError({ title: "Save failed", description: result.message }); return; }
			await loadConfig();
		} catch (e) { setError(errorPayload(e, "Save failed")); }
	}

	async function saveBranchPrefixFn() {
		setError(null);
		try {
			const result = await saveBranchPrefixAction(props.projectSlug, branchPrefix() ?? null);
			if (!result.ok) { setError({ title: "Save failed", description: result.message }); return; }
			await loadConfig();
		} catch (e) { setError(errorPayload(e, "Save failed")); }
	}

	async function saveConflictResolutionFn() {
		setError(null);
		try {
			const result = await saveConflictResolutionAction(props.projectSlug, conflictPrompt());
			if (!result.ok) { setError({ title: "Save failed", description: result.message }); return; }
			await loadConfig();
		} catch (e) { setError(errorPayload(e, "Save failed")); }
	}

	async function handleCreateBoard() {
		const f = boardForm(); if (!f || !f.name.trim()) return;
		setColumnDialogError("");
		try {
			const result = await runCreateBoard(f.name);
			if (!result.ok) { setColumnDialogError(result.message); return; }
			setBoardForm(null); setBoards(result.boards); setBoardOverride(result.id);
		} catch (e) { setColumnDialogError(errorMessage(e)); }
	}

	async function handleDeleteBoard() {
		const dc = deleteConfirm(); if (!dc || dc.type !== "board") return;
		try {
			const result = await runDeleteBoard(dc.id);
			if (!result.ok) {
				setDeleteConfirm(null);
				setError({ title: "Delete failed", description: result.message });
				return;
			}
			setDeleteConfirm(null); setBoards(result.boards);
		} catch (e) { setDeleteConfirm(null); setError(errorPayload(e, "Delete failed")); }
	}

	async function handleSaveColumn(submittedForm?: ColumnFormState) {
		const cf = submittedForm ?? columnForm(); if (!cf || !cf.name.trim()) return;
		setColumnDialogError("");
		const boardId = selectedBoardId(); if (!boardId) return;
		if (cf.mode === "edit" && cf.oldName) {
			const columnSlug = slugifyColumnName(cf.name);
			if (columnSlug !== cf.oldName) {
				setRenameForm({ oldName: cf.oldName, newName: cf.name, scope: "all" });
				return;
			}
			try {
				const result = await runUpdateColumn({
					boardId, columnName: cf.oldName, patch: columnContentPatch(cf),
				});
				if (!result.ok) { setColumnDialogError(result.message); return; }
				// Close the modal before replacing the board data that owns its form.
				flush(() => setColumnForm(null)); setBoards(result.boards);
			} catch (e) { setColumnDialogError(errorMessage(e)); }
		} else {
			try {
				const result = await runAddColumn({ boardId, name: cf.name, patch: columnContentPatch(cf) });
				if (!result.ok) { setColumnDialogError(result.message); return; }
				// Close the modal before replacing the board data that owns its form.
				flush(() => setColumnForm(null)); setBoards(result.boards);
			} catch (e) { setColumnDialogError(errorMessage(e)); }
		}
	}

	async function handleRenameColumn(submittedForm?: RenameFormState) {
		const rf = submittedForm ?? renameForm(); if (!rf) return;
		setColumnDialogError("");
		const boardId = selectedBoardId(); if (!boardId) return;
		try {
			const result = await runRenameColumn({
				boardId, columnName: rf.oldName, newName: rf.newName,
				scope: rf.scope, currentProjectSlug: props.projectSlug,
			});
			if (!result.ok) { setColumnDialogError(result.message); return; }
			const newName = result.newName ?? slugifyColumnName(rf.newName);
			let updatedBoards = result.boards;
			const cf = columnForm();
			if (cf && cf.description !== undefined) {
				try {
					const updateResult = await runUpdateColumn({
						boardId, columnName: newName, patch: columnContentPatch(cf),
					});
					if (!updateResult.ok) {
						setColumnDialogError(updateResult.message);
						setRenameForm(null);
						setColumnForm({ ...cf, name: newName, oldName: newName });
						setBoards(result.boards); return;
					}
					updatedBoards = updateResult.boards;
				} catch (updateErr) {
					setColumnDialogError(errorMessage(updateErr));
					setRenameForm(null);
					setColumnForm({ ...cf, name: newName, oldName: newName });
					setBoards(result.boards); return;
				}
			}
			setRenameForm(null); setColumnForm(null); setBoards(updatedBoards);
		} catch (e) { setColumnDialogError(errorMessage(e)); }
	}

	async function handleDeleteColumn() {
		const dc = deleteConfirm(); if (!dc || dc.type !== "column") return;
		const boardId = selectedBoardId(); if (!boardId) return;
		try {
			const result = await runDeleteColumn({ boardId, columnName: dc.id });
			if (!result.ok) {
				setDeleteConfirm(null);
				setError({ title: "Delete failed", description: result.message });
				return;
			}
			setDeleteConfirm(null); setBoards(result.boards);
		} catch (e) { setDeleteConfirm(null); setError(errorPayload(e, "Delete failed")); }
	}

	async function handleReorderColumns(orderedNames: string[]) {
		const boardId = selectedBoardId(); if (!boardId) return;
		try {
			const result = await runReorderColumns({ boardId, columns: orderedNames });
			if (!result.ok) { setError({ title: "Reorder failed", description: result.message }); return; }
			setBoards(result.boards);
		} catch (e) { setError(errorPayload(e, "Reorder failed")); }
	}

	async function handleBoardIdChange(boardId: string): Promise<boolean> {
		setError(null);
		try {
			const result = await setBoardIdAction(props.projectSlug, boardId);
			if (!result.ok) { setError({ title: "Save failed", description: result.message }); return false; }
			await loadConfig(); return true;
		} catch (e) { setError(errorPayload(e, "Save failed")); return false; }
	}

	async function handleSetProjectBoard() {
		const pbc = projectBoardConfirm(); if (!pbc) return;
		if (await handleBoardIdChange(pbc.id)) setProjectBoardConfirm(null);
	}

	function columnNameValidation(): string {
		const cf = columnForm(); if (!cf) return "";
		return validateColumnName(cf.name, cf.mode, cf.oldName, selectedBoard()?.columns ?? []);
	}

	const columnReorder = createListReorder<ColumnDefinition>({
		items: () => selectedBoard()?.columns ?? [],
		idOf: (c) => c.name,
		onReorder: (orderedNames) => {
			const board = selectedBoard(); if (!board) return;
			const colMap = new Map(board.columns.map(c => [c.name, c]));
			const newColumns = orderedNames.map(n => colMap.get(n)!);
			setBoards(prev => prev.map(
				b => b.id === board.id ? { ...b, columns: newColumns } : b,
			));
			handleReorderColumns(orderedNames);
		},
	});

	type OrderedConfigKey = "templates" | "skills" | "profiles" | "shortcuts";
	type ItemFor<K extends OrderedConfigKey> = MergedLauncherConfig[K][number];

	function createItemReorder<K extends OrderedConfigKey>(
		itemType: LauncherItemType,
		collection: K,
	) {
		return createListReorder<ItemFor<K>>({
			items: () => config()?.[collection] ?? [],
			idOf: (item) => item.name,
			onReorder: (orderedNames, dragged) => {
				const cfg = config(); if (!cfg) return;
				const items = cfg[collection];
				const orderOf = (name: string) =>
					items.find(item => item.name === name)?.order;
				const newIndex = orderedNames.indexOf(dragged.name);
				const before = newIndex > 0
					? orderOf(orderedNames[newIndex - 1]) : undefined;
				const after = newIndex < orderedNames.length - 1
					? orderOf(orderedNames[newIndex + 1]) : undefined;
				const newOrder = midpointOrder(before, after);
				const itemMap = new Map(items.map(item => [item.name, item]));
				const reorderedItems = orderedNames.map(name => {
					const item = itemMap.get(name)!;
					return name === dragged.name ? { ...item, order: newOrder } : item;
				});
				setConfig(Object.assign({}, cfg, { [collection]: reorderedItems }));
				saveItemOrderFn(itemType, dragged.scope, dragged.name, newOrder);
			},
		});
	}

	const templateReorder = createItemReorder("template", "templates");
	const skillReorder = createItemReorder("skill", "skills");
	const profileReorder = createItemReorder("profile", "profiles");
	const shortcutReorder = createItemReorder("shortcut", "shortcuts");

	async function saveItemOrderFn(
		itemType: LauncherItemType,
		scope: Scope,
		name: string,
		order: number,
	) {
		setError(null);
		try {
			const result = await reorderItem(props.projectSlug, itemType, scope, name, order);
			if (!result.ok) {
				setError({ title: "Reorder failed", description: result.message });
				await loadConfig();
			}
		} catch (e) { setError(errorPayload(e, "Reorder failed")); }
	}

	return {
		config, loading, error, setError, form, setForm,
		projectName, setProjectName, worktreeRootPath, setWorktreeRootPath,
		branchPrefix, setBranchPrefix, conflictPrompt, setConflictPrompt, activeTab, setActiveTab,
		boards, projectBoardId, boardOverride, setBoardOverride,
		columnForm, setColumnForm, boardForm, setBoardForm, renameForm, setRenameForm,
		deleteConfirm, setDeleteConfirm, projectBoardConfirm, setProjectBoardConfirm,
		columnDialogError, setColumnDialogError,
		selectedBoardId, selectedBoard, startAdd, startEdit, submitForm, deleteItem: deleteItemFn,
		saveProjectName: saveProjectNameFn, saveWorktreeRootPath: saveWorktreeRootPathFn,
		saveBranchPrefix: saveBranchPrefixFn, saveConflictResolution: saveConflictResolutionFn,
		handleCreateBoard, handleDeleteBoard, handleSaveColumn,
		handleDeleteColumn, handleRenameColumn, handleSetProjectBoard,
		columnNameValidation, columnReorder,
		templateReorder, skillReorder, profileReorder, shortcutReorder,
	};
}

export type LauncherSettingsController = ReturnType<typeof createLauncherSettingsState>;
