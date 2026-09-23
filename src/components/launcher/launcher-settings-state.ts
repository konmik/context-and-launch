import { createSignal, createEffect, createMemo, flush, useContext } from "solid-js";
import { revalidate, useAction } from "@solidjs/router";
import type {
  LauncherItemType,
  MergedLauncherConfig,
} from "~/core/launcher/launcher-config.js";
import type { BoardDefinition, ColumnDefinition } from "~/core/project/board-config.js";
import { errorPayload, errorMessage, type ErrorInfo } from "~/core/shared/errors.js";
import { slugifyColumnName } from "~/lib/slugify.js";
import {
  getProjectLauncherConfig, type ProjectLauncherConfigData,
} from "./launcher-api.js";
import {
  listBoards, createBoard, deleteBoard, addColumn, updateColumn,
  deleteColumn, renameColumn, reorderColumns,
} from "../board/board-api.js";
import {
	setProjectPath as setProjectPathAction,
	setTicketsLocation as setTicketsLocationAction,
} from "../project/project-api.js";
import { createListReorder, midpointOrder } from "../board/list-reorder.js";
import type {
  ItemType, Scope, ItemFormState, ColumnFormState,
  RenameFormState, DeleteTarget,
} from "./launcher-settings-dialogs.js";
import { validateColumnName } from "./launcher-settings-pure.js";
import type { BoardRef } from "../board/board-api.js";
import { AppConfigContext } from '../config/app-config-storage.js';
import { LauncherConfigContext } from './shared-launcher-config-storage.js';
import {
  mergeLauncherConfigs, type LauncherConfig,
} from '~/core/launcher/launcher-config-data.js';
import { updateProjectLauncherConfig } from './project-launcher-config-storage.js';
import type { Updater } from '~/util/updater.js';

const collections = { template: 'templates', skill: 'skills', profile: 'profiles', shortcut: 'shortcuts' } as const;

function columnContentPatch(cf: ColumnFormState) {
	return { description: cf.description, color: cf.color };
}

export function createLauncherSettingsState(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projectSlug: string;
}) {
	const appConfig = useContext(AppConfigContext)!;
	const sharedConfig = useContext(LauncherConfigContext)!;
	const projectConfig = createMemo(() => props.open ? getProjectLauncherConfig(props.projectSlug) : null,
		{ loadingValue: null });
	const config = createMemo(() => {
		const project = projectConfig();
		return project && mergeLauncherConfigs(sharedConfig.get(), project.projectConfig);
	});
	const [loading, setLoading] = createSignal(false);
	const [error, setError] = createSignal<ErrorInfo | null>(null);
	const [form, setForm] = createSignal<ItemFormState | null>(null);
	const [projectName, setProjectName] = createSignal("");
	const [projectPath, setProjectPath] = createSignal("");
	const [savingProjectPath, setSavingProjectPath] = createSignal(false);
	const runSetProjectPath = useAction(setProjectPathAction);
	const [ticketsPath, setTicketsPath] = createSignal("");
	const [ticketsBranch, setTicketsBranch] = createSignal("");
	const [savingTicketsLocation, setSavingTicketsLocation] = createSignal(false);
	const runSetTicketsLocation = useAction(setTicketsLocationAction);
	const [worktreeRootPath, setWorktreeRootPath] = createSignal("");
	const [branchPrefix, setBranchPrefix] = createSignal<string | undefined>(undefined);
	const [conflictPrompt, setConflictPrompt] = createSignal("");
	const [activeTab, setActiveTab] = createSignal<string>("profiles");
	const [boards, setBoards] = createSignal<BoardDefinition[]>([]);
	const projectBoardId = () => projectConfig()?.projectBoardId ?? null;
	const [boardOverride, setBoardOverride] = createSignal<string | null>(null);
	const [columnForm, setColumnForm] = createSignal<ColumnFormState | null>(null);
	const [boardForm, setBoardForm] = createSignal<{ name: string } | null>(null);
	const [renameForm, setRenameForm] = createSignal<RenameFormState | null>(null);
	const [deleteConfirm, setDeleteConfirm] = createSignal<DeleteTarget | null>(null);
	const [projectBoardConfirm, setProjectBoardConfirm] = createSignal<BoardRef | null>(null);
	const [columnDialogError, setColumnDialogError] = createSignal("");
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

	function applyConfig(data: ProjectLauncherConfigData) {
		const merged = mergeLauncherConfigs(sharedConfig.get(), data.projectConfig);
		setProjectName(data.projectName ?? "");
		setProjectPath(data.projectPath);
		setTicketsPath(data.worktreeDir);
		setTicketsBranch(data.ticketsBranch ?? "");
		setWorktreeRootPath(merged.worktreeRootPath ?? "");
		setBranchPrefix(merged.branchPrefix);
		setConflictPrompt(merged.conflictResolutionPrompt);
	}

	async function loadConfig() {
		setLoading(true); setError(null);
		const [configResult, boardsResult] = await Promise.allSettled([
			(async () => {
				await revalidate("launcher-config");
				return getProjectLauncherConfig(props.projectSlug);
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
			const usesCommand = f.itemType === "profile" || f.itemType === "shortcut";
			const fields = usesCommand
				? { name: f.name, command: f.text }
				: { name: f.name, text: f.text };
			const result = await updateConfig(f.scope, current => {
				const key = collections[f.itemType];
				const items = current[key] ?? [];
				if (items.some(item => item.name === fields.name && (f.mode === 'add' || item.name !== f.oldName))) {
					throw new Error(`An item named "${fields.name}" already exists`);
				}
				if (f.mode === 'add') return { ...current, [key]: [...items, fields] };
				if (!items.some(item => item.name === f.oldName)) throw new Error(`Item "${f.oldName}" not found`);
				return {
					...current,
					[key]: items.map(item => item.name === f.oldName ? { ...item, ...fields } : item),
					columnDefaults: current.columnDefaults && Object.fromEntries(
						Object.entries(current.columnDefaults).map(([column, defaults]) => [column, {
							...defaults,
							templateName: f.itemType === 'template' && defaults.templateName === f.oldName
								? f.name : defaults.templateName,
							profileName: f.itemType === 'profile' && defaults.profileName === f.oldName
								? f.name : defaults.profileName,
							checkedSkills: f.itemType === 'skill'
								? defaults.checkedSkills.map(name => name === f.oldName ? f.name : name)
								: defaults.checkedSkills,
							skillOrder: f.itemType === 'skill'
								? defaults.skillOrder?.map(name => name === f.oldName ? f.name : name)
								: defaults.skillOrder,
						}]),
					),
				};
			});
			if (result.type === 'Failure') { setError({ title: 'Save failed', description: result.error }); return; }
			setForm(null);
		} catch (e) { setError(errorPayload(e, "Save failed")); }
	}

	async function deleteItemFn(itemType: ItemType, scope: Scope, name: string) {
		setError(null);
		try {
			const result = await updateConfig(scope, current => ({
				...current,
				[collections[itemType]]: (current[collections[itemType]] ?? []).filter(item => item.name !== name),
				columnDefaults: current.columnDefaults && Object.fromEntries(
					Object.entries(current.columnDefaults).map(([column, defaults]) => [column, {
						...defaults,
						templateName: itemType === 'template' && defaults.templateName === name
							? null : defaults.templateName,
						profileName: itemType === 'profile' && defaults.profileName === name
							? null : defaults.profileName,
						checkedSkills: itemType === 'skill'
							? defaults.checkedSkills.filter(value => value !== name) : defaults.checkedSkills,
						skillOrder: itemType === 'skill'
							? defaults.skillOrder?.filter(value => value !== name) : defaults.skillOrder,
					}]),
				),
			}));
			if (result.type === 'Failure') setError({ title: 'Delete failed', description: result.error });
		} catch (e) { setError(errorPayload(e, "Delete failed")); }
	}

	async function saveProjectNameFn() {
		setError(null);
		try {
			const name = projectName().trim() || undefined;
			const result = await appConfig.update(current => ({
				...current,
				projects: current.projects.map(project => project.projectSlug === props.projectSlug
					? { ...project, name } : project),
			}));
			if (result.type === 'Failure') setError({ title: "Save failed", description: result.error });
		} catch (e) { setError(errorPayload(e, "Save failed")); }
	}

	async function saveWorktreeRootPathFn(path = worktreeRootPath()) {
		setError(null);
		try {
			const result = await updateConfig('project', current => ({
				...current, worktreeRootPath: path.trim() || undefined,
			}));
			if (result.type === 'Failure') setError({ title: 'Save failed', description: result.error });
		} catch (e) { setError(errorPayload(e, "Save failed")); }
	}

	async function saveProjectPathFn(path = projectPath()) {
		if (savingProjectPath() || path.trim() === projectConfig()?.projectPath) return;
		setSavingProjectPath(true);
		setError(null);
		try {
			const result = await runSetProjectPath(props.projectSlug, path);
			if (!result.ok) { setError({ title: "Save failed", description: result.message }); return; }
			setProjectPath(result.path);
			await revalidate(["launcher-config", "project-page", "project-sync-status"]);
		} catch (e) { setError(errorPayload(e, "Save failed")); }
		finally { setSavingProjectPath(false); }
	}

	async function saveBranchPrefixFn() {
		setError(null);
		try {
			const value = branchPrefix()?.trim() || undefined;
			const result = await updateConfig('project', current => ({ ...current, branchPrefix: value }));
			if (result.type === 'Failure') setError({ title: 'Save failed', description: result.error });
		} catch (e) { setError(errorPayload(e, "Save failed")); }
	}

	async function saveTicketsLocation(kind: "path" | "branch", value: string) {
		const saved = projectConfig();
		if (value.trim() === (kind === "path" ? saved?.worktreeDir : saved?.ticketsBranch ?? '')) return;
		if (savingTicketsLocation()) return;
		setSavingTicketsLocation(true);
		setError(null);
		try {
			const result = await runSetTicketsLocation(props.projectSlug, { kind, value });
			if (!result.ok) { setError({ title: "Save failed", description: result.message }); return; }
			if (kind === "path") {
				setTicketsPath(result.value);
			} else {
				setTicketsBranch(result.value);
			}
			await revalidate("launcher-config");
		} catch (e) { setError(errorPayload(e, "Save failed")); }
		finally { setSavingTicketsLocation(false); }
	}

	async function saveConflictResolutionFn() {
		setError(null);
		try {
			const value = conflictPrompt().trim() || undefined;
			const result = await updateConfig('project', current => ({ ...current, conflictResolutionPrompt: value }));
			if (result.type === 'Failure') setError({ title: 'Save failed', description: result.error });
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
			const result = await appConfig.update(current => ({
				...current,
				projects: current.projects.map(project => project.projectSlug === props.projectSlug
					? { ...project, boardId } : project),
			}));
			if (result.type === 'Failure') {
				setError({ title: "Save failed", description: result.error });
				return false;
			}
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
			const result = await updateConfig(scope, current => ({
				...current,
				[collections[itemType]]: (current[collections[itemType]] ?? [])
					.map(item => item.name === name ? { ...item, order } : item),
			}));
			if (result.type === 'Failure') setError({ title: 'Reorder failed', description: result.error });
		} catch (e) { setError(errorPayload(e, "Reorder failed")); }
	}

	async function updateConfig(scope: Scope, transform: Updater<LauncherConfig>) {
		if (scope === 'app') return sharedConfig.update(transform);
		const projectSlug = props.projectSlug;
		return updateProjectLauncherConfig(projectSlug, transform);
	}

	return {
		config, loading, error, setError, form, setForm,
		projectName, setProjectName, worktreeRootPath, setWorktreeRootPath,
		projectPath, setProjectPath, savingProjectPath, saveProjectPath: saveProjectPathFn,
		ticketsPath, setTicketsPath, ticketsBranch, setTicketsBranch, savingTicketsLocation,
		saveTicketsPath: (path = ticketsPath()) => saveTicketsLocation("path", path),
		saveTicketsBranch: () => saveTicketsLocation("branch", ticketsBranch()),
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
