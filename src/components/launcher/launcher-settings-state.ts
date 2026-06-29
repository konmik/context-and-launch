import { createSignal, createEffect, createMemo, onCleanup, on } from "solid-js";
import { revalidate } from "@solidjs/router";
import type { MergedLauncherConfig } from "~/core/launcher/launcher-config.js";
import type { BoardDefinition, ColumnDefinition } from "~/core/project/board-config.js";
import { slugifyColumnName } from "~/lib/slugify.js";
import {
  getMergedLauncherConfig, type MergedLauncherConfigWithMeta,
  addItem, updateItem, deleteItem as deleteItemAction,
  reorderSkill, saveWorktreeRootPath as saveWorktreeRootPathAction,
  saveBranchPrefix as saveBranchPrefixAction,
  saveConflictResolution as saveConflictResolutionAction,
} from "./launcher-api.js";
import {
  listBoards, createBoard, deleteBoard, addColumn, updateColumn,
  deleteColumn, renameColumn, reorderColumns,
} from "../board/board-api.js";
import { setProjectName as setProjectNameAction, setBoardId as setBoardIdAction } from "../project/project-api.js";
import { createListReorder, midpointOrder } from "../board/list-reorder.js";
import type { MergedSkill } from "./launcher-settings-rows.js";
import type {
  ItemType, Scope, ItemFormState, ColumnFormState,
  RenameFormState, DeleteTarget,
} from "./launcher-settings-dialogs.js";
import { validateColumnName, buildFormPayload } from "./launcher-settings-pure.js";
import type { BoardRef } from "../board/board-api.js";

export function createLauncherSettingsState(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projectSlug: string;
}) {
	const [config, setConfig] = createSignal<MergedLauncherConfig | null>(null);
	const [loading, setLoading] = createSignal(false);
	const [error, setError] = createSignal("");
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
	const [columnError, setColumnError] = createSignal("");

	const selectedBoardId = createMemo(() => {
		const list = boards();
		const valid = (id: string | null | undefined) => (id && list.some(b => b.id === id) ? id : null);
		return valid(boardOverride()) ?? valid(projectBoardId()) ?? list[0]?.id ?? "";
	});

	const selectedBoard = () => boards().find(b => b.id === selectedBoardId());

	createEffect(on(() => props.open, (open) => {
		if (open) {
			setBoardOverride(null); loadConfig(); setForm(null);
			setColumnForm(null); setBoardForm(null); setRenameForm(null);
			setDeleteConfirm(null); setProjectBoardConfirm(null);
		}
	}));

	const anyDialogOpen = () =>
		!!form() || !!columnForm() || !!boardForm()
		|| !!renameForm() || !!deleteConfirm() || !!projectBoardConfirm();

	createEffect(() => {
		if (!props.open) return;
		function handler(e: KeyboardEvent) {
			if (e.key !== "Escape" || e.defaultPrevented) return;
			if (anyDialogOpen()) return;
			e.preventDefault();
			props.onOpenChange(false);
		}
		document.addEventListener("keydown", handler);
		onCleanup(() => document.removeEventListener("keydown", handler));
	});

	async function loadConfig() {
		setLoading(true); setError("");
		await Promise.all([revalidate("launcher-config"), revalidate("boards")]);
		try {
			const data: MergedLauncherConfigWithMeta = await getMergedLauncherConfig(props.projectSlug);
			setConfig(data);
			setProjectBoardId(data.projectBoardId ?? null);
			setProjectName(data.projectName ?? "");
			setWorktreeRootPath(data.worktreeRootPath ?? "");
			setBranchPrefix(data.branchPrefix);
			setConflictPrompt(data.conflictResolutionPrompt ?? "");
		} catch (e) { setError(e instanceof Error ? e.message : "Failed to load config"); }
		finally { setLoading(false); }
		await loadBoards();
	}

	async function loadBoards() {
		try {
			setBoards(await listBoards());
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load boards");
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

	async function submitForm() {
		const f = form();
		if (!f || !f.name.trim()) return;
		setError("");
		try {
			const payload = buildFormPayload(f);
			const usesCommand = f.itemType === "profile" || f.itemType === "shortcut";
			const fields = {
				name: payload.name!,
				text: usesCommand ? undefined : payload.text,
				command: usesCommand ? payload.command ?? payload.text : undefined,
			};
			if (f.mode === "add") {
				const result = await addItem(props.projectSlug, f.itemType, f.scope, fields);
				if (!result.ok) { setError(result.message); return; }
			} else {
				const result = await updateItem(props.projectSlug, f.itemType, f.scope, f.oldName!, fields);
				if (!result.ok) { setError(result.message); return; }
			}
			setForm(null); await loadConfig();
		} catch (e) { setError(e instanceof Error ? e.message : "Failed to save"); }
	}

	async function deleteItemFn(itemType: ItemType, scope: Scope, name: string) {
		setError("");
		try {
			const result = await deleteItemAction(props.projectSlug, itemType, scope, name);
			if (!result.ok) { setError(result.message); return; }
			await loadConfig();
		} catch (e) { setError(e instanceof Error ? e.message : "Failed to delete"); }
	}

	async function saveProjectNameFn() {
		setError("");
		try {
			const result = await setProjectNameAction(props.projectSlug, projectName());
			if (!result.ok) setError(result.message);
		} catch (e) { setError(e instanceof Error ? e.message : "Failed to save"); }
	}

	async function saveWorktreeRootPathFn() {
		setError("");
		try {
			const result = await saveWorktreeRootPathAction(props.projectSlug, worktreeRootPath());
			if (!result.ok) { setError(result.message); return; }
			await loadConfig();
		} catch (e) { setError(e instanceof Error ? e.message : "Failed to save"); }
	}

	async function saveBranchPrefixFn() {
		setError("");
		try {
			const result = await saveBranchPrefixAction(props.projectSlug, branchPrefix());
			if (!result.ok) { setError(result.message); return; }
			await loadConfig();
		} catch (e) { setError(e instanceof Error ? e.message : "Failed to save"); }
	}

	async function saveConflictResolutionFn() {
		setError("");
		try {
			const result = await saveConflictResolutionAction(props.projectSlug, conflictPrompt());
			if (!result.ok) { setError(result.message); return; }
			await loadConfig();
		} catch (e) { setError(e instanceof Error ? e.message : "Failed to save"); }
	}

	async function handleCreateBoard() {
		const f = boardForm(); if (!f || !f.name.trim()) return;
		setColumnError("");
		try {
			const result = await createBoard(f.name);
			if (!result.ok) { setColumnError(result.message); return; }
			setBoardForm(null); await loadBoards(); setBoardOverride(result.id);
		} catch (e) { setColumnError(e instanceof Error ? e.message : "Failed to create board"); }
	}

	async function handleDeleteBoard() {
		const dc = deleteConfirm(); if (!dc || dc.type !== "board") return;
		setColumnError("");
		try {
			const result = await deleteBoard(dc.id);
			if (!result.ok) { setColumnError(result.message); return; }
			setDeleteConfirm(null); await loadBoards();
		} catch (e) { setColumnError(e instanceof Error ? e.message : "Failed to delete board"); }
	}

	async function handleSaveColumn() {
		const cf = columnForm(); if (!cf || !cf.name.trim()) return;
		setColumnError("");
		const boardId = selectedBoardId(); if (!boardId) return;
		if (cf.mode === "edit" && cf.oldName) {
			const columnSlug = slugifyColumnName(cf.name);
			if (columnSlug !== cf.oldName) {
				setRenameForm({ oldName: cf.oldName, newName: cf.name, scope: "all" });
				return;
			}
			try {
				const result = await updateColumn(boardId, cf.oldName, cf.description);
				if (!result.ok) { setColumnError(result.message); return; }
				setColumnForm(null); await loadBoards();
			} catch (e) { setColumnError(e instanceof Error ? e.message : "Failed to update column"); }
		} else {
			try {
				const result = await addColumn(boardId, cf.name, cf.description || undefined);
				if (!result.ok) { setColumnError(result.message); return; }
				setColumnForm(null); await loadBoards();
			} catch (e) { setColumnError(e instanceof Error ? e.message : "Failed to add column"); }
		}
	}

	async function handleRenameColumn() {
		const rf = renameForm(); if (!rf) return;
		setColumnError("");
		const boardId = selectedBoardId(); if (!boardId) return;
		try {
			const result = await renameColumn(
				boardId, rf.oldName, rf.newName, rf.scope, props.projectSlug,
			);
			if (!result.ok) { setColumnError(result.message); return; }
			const newName = result.newName ?? slugifyColumnName(rf.newName);
			const cf = columnForm();
			if (cf && cf.description !== undefined) {
				try {
					const descResult = await updateColumn(boardId, newName, cf.description);
					if (!descResult.ok) {
						setColumnError(descResult.message);
						setRenameForm(null);
						setColumnForm({ ...cf, name: newName, oldName: newName });
						await loadBoards(); return;
					}
				} catch (descErr) {
					setColumnError(descErr instanceof Error ? descErr.message : "Failed to update description");
					setRenameForm(null);
					setColumnForm({ ...cf, name: newName, oldName: newName });
					await loadBoards(); return;
				}
			}
			setRenameForm(null); setColumnForm(null); await loadBoards();
		} catch (e) { setColumnError(e instanceof Error ? e.message : "Failed to rename column"); }
	}

	async function handleDeleteColumn() {
		const dc = deleteConfirm(); if (!dc || dc.type !== "column") return;
		setColumnError("");
		const boardId = selectedBoardId(); if (!boardId) return;
		try {
			const result = await deleteColumn(boardId, dc.id);
			if (!result.ok) { setColumnError(result.message); return; }
			setDeleteConfirm(null); await loadBoards();
		} catch (e) { setColumnError(e instanceof Error ? e.message : "Failed to delete column"); }
	}

	async function handleReorderColumns(orderedNames: string[]) {
		const boardId = selectedBoardId(); if (!boardId) return;
		try {
			const result = await reorderColumns(boardId, orderedNames);
			if (!result.ok) { setColumnError(result.message); return; }
			await loadBoards();
		} catch (e) { setColumnError(e instanceof Error ? e.message : "Failed to reorder"); }
	}

	async function handleBoardIdChange(boardId: string): Promise<boolean> {
		setError("");
		try {
			const result = await setBoardIdAction(props.projectSlug, boardId);
			if (!result.ok) { setError(result.message); return false; }
			await loadConfig(); return true;
		} catch (e) { setError(e instanceof Error ? e.message : "Failed to save"); return false; }
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

	const skillReorder = createListReorder<MergedSkill>({
		items: () => config()?.skills ?? [],
		idOf: (s) => s.name,
		onReorder: (orderedNames, dragged) => {
			const cfg = config(); if (!cfg) return;
			const orderOf = (name: string) =>
				cfg.skills.find(s => s.name === name)?.order;
			const newIndex = orderedNames.indexOf(dragged.name);
			const before = newIndex > 0
				? orderOf(orderedNames[newIndex - 1]) : undefined;
			const after = newIndex < orderedNames.length - 1
				? orderOf(orderedNames[newIndex + 1]) : undefined;
			const newOrder = midpointOrder(before, after);
			const skillMap = new Map(cfg.skills.map(s => [s.name, s]));
			const newSkills = orderedNames.map(n => {
				const s = skillMap.get(n)!;
				return n === dragged.name ? { ...s, order: newOrder } : s;
			});
			setConfig({ ...cfg, skills: newSkills });
			saveSkillOrderFn(dragged.scope, dragged.name, newOrder);
		},
	});

	async function saveSkillOrderFn(scope: Scope, name: string, order: number) {
		setError("");
		try {
			const result = await reorderSkill(props.projectSlug, scope, name, order);
			if (!result.ok) { setError(result.message); return; }
			await loadConfig();
		} catch (e) { setError(e instanceof Error ? e.message : "Failed to reorder"); }
	}

	return {
		config, loading, error, setError, form, setForm,
		projectName, setProjectName, worktreeRootPath, setWorktreeRootPath,
		branchPrefix, setBranchPrefix, conflictPrompt, setConflictPrompt, activeTab, setActiveTab,
		boards, projectBoardId, boardOverride, setBoardOverride,
		columnForm, setColumnForm, boardForm, setBoardForm, renameForm, setRenameForm,
		deleteConfirm, setDeleteConfirm, projectBoardConfirm, setProjectBoardConfirm, columnError, setColumnError,
		selectedBoardId, selectedBoard, startAdd, startEdit, submitForm, deleteItem: deleteItemFn,
		saveProjectName: saveProjectNameFn, saveWorktreeRootPath: saveWorktreeRootPathFn,
		saveBranchPrefix: saveBranchPrefixFn, saveConflictResolution: saveConflictResolutionFn,
		handleCreateBoard, handleDeleteBoard, handleSaveColumn,
		handleDeleteColumn, handleRenameColumn, handleSetProjectBoard,
		columnNameValidation, columnReorder, skillReorder,
	};
}

export type LauncherSettingsController = ReturnType<typeof createLauncherSettingsState>;
