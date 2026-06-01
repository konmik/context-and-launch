import { createSignal, createEffect, createMemo, onCleanup, on } from "solid-js";
import type { MergedLauncherConfig } from "~/server/launcher/launcher-config.js";
import type { BoardDefinition, ColumnDefinition } from "~/server/project/board-config.js";
import { slugifyColumnName } from "~/lib/slugify.js";
import { fetchBoards, type BoardRef } from "~/lib/fetch-boards.js";
import { createListReorder, midpointOrder } from "../board/list-reorder.js";
import type { MergedSkill } from "./launcher-settings-rows.js";
import type {
	ItemType, Scope, ItemFormState, ColumnFormState,
	RenameFormState, DeleteTarget,
} from "./launcher-settings-dialogs.js";
import { itemEndpoint, validateColumnName, buildFormPayload } from "./launcher-settings-pure.js";

export function createLauncherSettingsState(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projectSlug: string;
}) {
	const [config, setConfig] = createSignal<MergedLauncherConfig | null>(null);
	const [loading, setLoading] = createSignal(false);
	const [error, setError] = createSignal("");
	const [form, setForm] = createSignal<ItemFormState | null>(null);
	const [conflictPrompt, setConflictPrompt] = createSignal("");
	const [activeTab, setActiveTab] = createSignal<string>("general");
	const [boards, setBoards] = createSignal<BoardDefinition[]>([]);
	const [boardOverride, setBoardOverride] = createSignal<string | null>(null);
	const [columnForm, setColumnForm] = createSignal<ColumnFormState | null>(null);
	const [boardForm, setBoardForm] = createSignal<{ name: string } | null>(null);
	const [renameForm, setRenameForm] = createSignal<RenameFormState | null>(null);
	const [deleteConfirm, setDeleteConfirm] = createSignal<DeleteTarget | null>(null);
	const [projectBoardConfirm, setProjectBoardConfirm] = createSignal<BoardRef | null>(null);
	const [columnError, setColumnError] = createSignal("");

	const selectedBoardId = createMemo(() => {
		const list = boards();
		const valid = (id: string | undefined) => (id && list.some(b => b.id === id) ? id : null);
		return valid(boardOverride() ?? undefined) ?? valid(config()?.boardId) ?? list[0]?.id ?? "";
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
		try {
			const res = await fetch(`/api/projects/${props.projectSlug}/launcher-config`);
			if (res.ok) {
			const data = await res.json();
			setConfig(data);
			setConflictPrompt(data.conflictResolutionPrompt ?? "");
		}
			else setError(await res.text() || "Failed to load config");
		} catch (e) { setError(e instanceof Error ? e.message : "Failed to load config"); }
		finally { setLoading(false); }
		await loadBoards();
	}

	async function loadBoards() {
		try {
			setBoards(await fetchBoards());
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
		const endpoint = itemEndpoint(props.projectSlug, f.itemType, f.scope);
		try {
			const payload = buildFormPayload(f);
			const res = await fetch(endpoint, {
				method: f.mode === "add" ? "POST" : "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});
			if (!res.ok) { setError(await res.text() || "Failed to save"); return; }
			setForm(null); await loadConfig();
		} catch (e) { setError(e instanceof Error ? e.message : "Failed to save"); }
	}

	async function deleteItem(itemType: ItemType, scope: Scope, name: string) {
		setError("");
		try {
			const res = await fetch(itemEndpoint(props.projectSlug, itemType, scope), {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name }),
			});
			if (!res.ok) { setError(await res.text() || "Failed to delete"); return; }
			await loadConfig();
		} catch (e) { setError(e instanceof Error ? e.message : "Failed to delete"); }
	}

	async function saveConflictResolution() {
		setError("");
		try {
			const res = await fetch(
				`/api/projects/${props.projectSlug}/launcher-config/conflict-resolution`,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ conflictResolutionPrompt: conflictPrompt() }),
				},
			);
			if (!res.ok) { setError(await res.text() || "Failed to save"); return; }
			await loadConfig();
		} catch (e) { setError(e instanceof Error ? e.message : "Failed to save"); }
	}

	async function handleCreateBoard() {
		const f = boardForm(); if (!f || !f.name.trim()) return;
		setColumnError("");
		try {
			const res = await fetch("/api/boards", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: f.name }),
			});
			if (!res.ok) { setColumnError(await res.text() || "Failed to create board"); return; }
			const created = await res.json(); setBoardForm(null); await loadBoards(); setBoardOverride(created.id);
		} catch (e) { setColumnError(e instanceof Error ? e.message : "Failed to create board"); }
	}

	async function handleDeleteBoard() {
		const dc = deleteConfirm(); if (!dc || dc.type !== "board") return;
		setColumnError("");
		try {
			const res = await fetch(`/api/boards/${dc.id}`, { method: "DELETE" });
			if (!res.ok) { setColumnError(await res.text() || "Failed to delete board"); return; }
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
				const res = await fetch(
					`/api/boards/${boardId}/columns/${cf.oldName}`,
					{
						method: "PUT",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ description: cf.description }),
					},
				);
				if (!res.ok) { setColumnError(await res.text() || "Failed to update column"); return; }
				setColumnForm(null); await loadBoards();
			} catch (e) { setColumnError(e instanceof Error ? e.message : "Failed to update column"); }
		} else {
			try {
				const res = await fetch(`/api/boards/${boardId}/columns`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						name: cf.name,
						description: cf.description || undefined,
					}),
				});
				if (!res.ok) { setColumnError(await res.text() || "Failed to add column"); return; }
				setColumnForm(null); await loadBoards();
			} catch (e) { setColumnError(e instanceof Error ? e.message : "Failed to add column"); }
		}
	}

	async function handleRenameColumn() {
		const rf = renameForm(); if (!rf) return;
		setColumnError("");
		const boardId = selectedBoardId(); if (!boardId) return;
		try {
			const res = await fetch(
				`/api/boards/${boardId}/columns/${rf.oldName}/rename`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						newName: rf.newName,
						scope: rf.scope,
						currentProjectSlug: props.projectSlug,
					}),
				},
			);
			if (!res.ok) { setColumnError(await res.text() || "Failed to rename column"); return; }
			let newName = slugifyColumnName(rf.newName);
			try {
				const result = await res.json();
				newName = result.newName ?? newName;
			} catch (_e) {
				console.warn(
					"Failed to parse rename response, using client-side column slug:",
					_e,
				);
			}
			const cf = columnForm();
			if (cf && cf.description !== undefined) {
				try {
					const descRes = await fetch(
						`/api/boards/${boardId}/columns/${newName}`,
						{
							method: "PUT",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ description: cf.description }),
						},
					);
					if (!descRes.ok) {
						setColumnError(await descRes.text() || "Failed to update description");
						setRenameForm(null);
						setColumnForm({ ...cf, name: newName, oldName: newName });
						await loadBoards(); return;
					}
				} catch (descErr) {
					setColumnError(
						descErr instanceof Error
							? descErr.message
							: "Failed to update description",
					);
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
			const res = await fetch(`/api/boards/${boardId}/columns/${dc.id}`, { method: "DELETE" });
			if (!res.ok) { setColumnError(await res.text() || "Failed to delete column"); return; }
			setDeleteConfirm(null); await loadBoards();
		} catch (e) { setColumnError(e instanceof Error ? e.message : "Failed to delete column"); }
	}

	async function handleReorderColumns(orderedNames: string[]) {
		const boardId = selectedBoardId(); if (!boardId) return;
		try {
			const res = await fetch(`/api/boards/${boardId}/columns/reorder`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ columns: orderedNames }),
			});
			if (!res.ok) { setColumnError(await res.text() || "Failed to reorder"); return; }
			await loadBoards();
		} catch (e) { setColumnError(e instanceof Error ? e.message : "Failed to reorder"); }
	}

	async function handleBoardIdChange(boardId: string): Promise<boolean> {
		setError("");
		try {
			const res = await fetch(
				`/api/projects/${props.projectSlug}/launcher-config/board-id`,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ boardId }),
				},
			);
			if (!res.ok) { setError(await res.text() || "Failed to save"); return false; }
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
			saveSkillOrder(dragged.scope, dragged.name, newOrder);
		},
	});

	async function saveSkillOrder(scope: Scope, name: string, order: number) {
		setError("");
		try {
			const res = await fetch(`${itemEndpoint(props.projectSlug, "skill", scope)}/reorder`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name, order }),
			});
			if (!res.ok) { setError(await res.text() || "Failed to reorder"); return; }
			await loadConfig();
		} catch (e) { setError(e instanceof Error ? e.message : "Failed to reorder"); }
	}

	return {
		config, loading, error, setError, form, setForm,
		conflictPrompt, setConflictPrompt, activeTab, setActiveTab, boards, boardOverride, setBoardOverride,
		columnForm, setColumnForm, boardForm, setBoardForm, renameForm, setRenameForm,
		deleteConfirm, setDeleteConfirm, projectBoardConfirm, setProjectBoardConfirm, columnError, setColumnError,
		selectedBoardId, selectedBoard, startAdd, startEdit, submitForm, deleteItem,
		saveConflictResolution, handleCreateBoard, handleDeleteBoard, handleSaveColumn,
		handleDeleteColumn, handleRenameColumn, handleSetProjectBoard,
		columnNameValidation, columnReorder, skillReorder,
	};
}

export type LauncherSettingsController = ReturnType<typeof createLauncherSettingsState>;
