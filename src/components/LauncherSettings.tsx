import { createSignal, createEffect, createMemo, onCleanup, on, Show } from "solid-js";
import { FloatingPanelRoot, FloatingPanelHeader, FloatingPanelBody, FloatingPanelDragTrigger, FloatingPanelResizeTrigger, FloatingPanelCloseTrigger, FloatingPanelTitle } from "./ui/floating-panel";
import { TabsRoot, TabsList, TabsTrigger } from "./ui/tabs";
import type { MergedLauncherConfig } from "~/server/launcher-config.js";
import type { BoardDefinition, ColumnDefinition } from "~/server/board-config.js";
import { useModEnterSubmit } from "~/lib/use-mod-enter-submit";
import { slugifyColumnName } from "~/lib/slugify.js";
import { createListReorder, midpointOrder } from "./list-reorder.js";
import type { MergedSkill } from "./launcher-settings-rows.js";
import { GeneralTab } from "./launcher-settings-general-tab.js";
import { PromptsTab } from "./launcher-settings-prompts-tab.js";
import { SkillsTab } from "./launcher-settings-skills-tab.js";
import { LaunchTab } from "./launcher-settings-launch-tab.js";
import { ColumnsTab } from "./launcher-settings-columns-tab.js";
import {
	ItemFormDialog,
	ColumnFormDialog,
	RenameColumnDialog,
	BoardFormDialog,
	DeleteConfirmDialog,
	ProjectBoardConfirmDialog,
	type ItemType,
	type Scope,
	type ItemFormState,
	type ColumnFormState,
	type RenameFormState,
	type DeleteTarget,
} from "./launcher-settings-dialogs.js";

interface LauncherSettingsProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	slug: string;
}

export default function LauncherSettings(props: LauncherSettingsProps) {
	const [config, setConfig] = createSignal<MergedLauncherConfig | null>(null);
	const [loading, setLoading] = createSignal(false);
	const [error, setError] = createSignal("");
	const [form, setForm] = createSignal<ItemFormState | null>(null);
	const [worktreeRootPath, setWorktreeRootPath] = createSignal("");
	const [conflictPrompt, setConflictPrompt] = createSignal("");
	const [activeTab, setActiveTab] = createSignal<string>("general");

	// Boards and columns state
	const [boards, setBoards] = createSignal<BoardDefinition[]>([]);
	const [boardOverride, setBoardOverride] = createSignal<string | null>(null);
	const [columnForm, setColumnForm] = createSignal<ColumnFormState | null>(null);
	const [boardForm, setBoardForm] = createSignal<{ name: string } | null>(null);
	const [renameForm, setRenameForm] = createSignal<RenameFormState | null>(null);
	const [deleteConfirm, setDeleteConfirm] = createSignal<DeleteTarget | null>(null);
	const [projectBoardConfirm, setProjectBoardConfirm] = createSignal<{ id: string; name: string } | null>(null);
	const [columnError, setColumnError] = createSignal("");

	const selectedBoardId = createMemo(() => {
		const list = boards();
		const valid = (id: string | null | undefined) => (id && list.some(b => b.id === id) ? id : null);
		return valid(boardOverride()) ?? valid(config()?.boardId) ?? list[0]?.id ?? "";
	});

	const selectedBoard = () => boards().find(b => b.id === selectedBoardId());

	const apiPathSegments: Record<ItemType, string> = { template: "templates", skill: "skills", profile: "profiles", shortcut: "shortcuts" };

	function itemEndpoint(itemType: ItemType, scope: Scope): string {
		const base = scope === "app" ? "/api/launcher-config" : `/api/projects/${props.slug}/launcher-config`;
		return `${base}/${apiPathSegments[itemType]}`;
	}

	createEffect(on(() => props.open, (open) => { if (open) { setBoardOverride(null); loadConfig(); setForm(null); setColumnForm(null); setBoardForm(null); setRenameForm(null); setDeleteConfirm(null); setProjectBoardConfirm(null); } }));

	const anyDialogOpen = () => !!form() || !!columnForm() || !!boardForm() || !!renameForm() || !!deleteConfirm() || !!projectBoardConfirm();

	// Close the settings panel on Escape. The floating panel is non-modal, so its
	// own Escape handler only fires when focus is inside it; this catches Escape
	// regardless of focus. When an inner dialog is open, let that dialog handle
	// Escape first so the topmost layer closes.
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
		setLoading(true);
		setError("");
		try {
			const res = await fetch(`/api/projects/${props.slug}/launcher-config`);
			if (res.ok) {
				const data = await res.json();
				setConfig(data);
				setWorktreeRootPath(data.worktreeRootPath ?? "");
				setConflictPrompt(data.conflictResolutionPrompt ?? "");
			} else setError(await res.text() || "Failed to load config");
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load config");
		} finally { setLoading(false); }
		await loadBoards();
	}

	async function loadBoards() {
		try {
			const res = await fetch("/api/boards");
			if (res.ok) {
				const data: BoardDefinition[] = await res.json();
				setBoards(data);
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load boards");
		}
	}

	function startAdd(itemType: ItemType) { setForm({ mode: "add", itemType, scope: "app", name: "", text: "" }); }

	function startEdit(itemType: ItemType, scope: Scope, name: string, text: string) {
		setForm({ mode: "edit", itemType, scope, name, text, oldName: name });
	}

	async function submitForm() {
		const f = form();
		if (!f || !f.name.trim()) return;
		setError("");
		const endpoint = itemEndpoint(f.itemType, f.scope);
		const usesCommand = f.itemType === "profile" || f.itemType === "shortcut";
		try {
			const payload = usesCommand
				? (f.mode === "add" ? { name: f.name, command: f.text } : { oldName: f.oldName, name: f.name, command: f.text })
				: (f.mode === "add" ? { name: f.name, text: f.text } : { oldName: f.oldName, name: f.name, text: f.text });
			const res = await fetch(endpoint, {
				method: f.mode === "add" ? "POST" : "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});
			if (!res.ok) { setError(await res.text() || "Failed to save"); return; }
			setForm(null);
			await loadConfig();
		} catch (e) { setError(e instanceof Error ? e.message : "Failed to save"); }
	}

	async function deleteItem(itemType: ItemType, scope: Scope, name: string) {
		setError("");
		try {
			const res = await fetch(itemEndpoint(itemType, scope), { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
			if (!res.ok) { setError(await res.text() || "Failed to delete"); return; }
			await loadConfig();
		} catch (e) { setError(e instanceof Error ? e.message : "Failed to delete"); }
	}

	async function saveWorktreeRootPath() {
		setError("");
		try {
			const res = await fetch(`/api/projects/${props.slug}/launcher-config/worktree-root-path`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ worktreeRootPath: worktreeRootPath() }) });
			if (!res.ok) { setError(await res.text() || "Failed to save"); return; }
			await loadConfig();
		} catch (e) { setError(e instanceof Error ? e.message : "Failed to save"); }
	}

	async function saveConflictResolution() {
		setError("");
		try {
			const res = await fetch(`/api/projects/${props.slug}/launcher-config/conflict-resolution`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conflictResolutionPrompt: conflictPrompt() }) });
			if (!res.ok) { setError(await res.text() || "Failed to save"); return; }
			await loadConfig();
		} catch (e) { setError(e instanceof Error ? e.message : "Failed to save"); }
	}

	// Board CRUD

	async function handleCreateBoard() {
		const f = boardForm();
		if (!f || !f.name.trim()) return;
		setColumnError("");
		try {
			const res = await fetch("/api/boards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: f.name }) });
			if (!res.ok) { setColumnError(await res.text() || "Failed to create board"); return; }
			const created = await res.json();
			setBoardForm(null);
			await loadBoards();
			setBoardOverride(created.id);
		} catch (e) { setColumnError(e instanceof Error ? e.message : "Failed to create board"); }
	}

	async function handleDeleteBoard() {
		const dc = deleteConfirm();
		if (!dc || dc.type !== "board") return;
		setColumnError("");
		try {
			const res = await fetch(`/api/boards/${dc.id}`, { method: "DELETE" });
			if (!res.ok) { setColumnError(await res.text() || "Failed to delete board"); return; }
			setDeleteConfirm(null);
			await loadBoards();
		} catch (e) { setColumnError(e instanceof Error ? e.message : "Failed to delete board"); }
	}

	// Column CRUD

	async function handleSaveColumn() {
		const cf = columnForm();
		if (!cf || !cf.name.trim()) return;
		setColumnError("");
		const boardId = selectedBoardId();
		if (!boardId) return;

		if (cf.mode === "edit" && cf.oldName) {
			const slugified = slugifyColumnName(cf.name);
			if (slugified !== cf.oldName) {
				// Name changed - show rename dialog
				setRenameForm({ oldName: cf.oldName, newName: cf.name, scope: "all" });
				return;
			}
			// Only description changed
			try {
				const res = await fetch(`/api/boards/${boardId}/columns/${cf.oldName}`, {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ description: cf.description }),
				});
				if (!res.ok) { setColumnError(await res.text() || "Failed to update column"); return; }
				setColumnForm(null);
				await loadBoards();
			} catch (e) { setColumnError(e instanceof Error ? e.message : "Failed to update column"); }
		} else {
			// Add new column
			try {
				const res = await fetch(`/api/boards/${boardId}/columns`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name: cf.name, description: cf.description || undefined }),
				});
				if (!res.ok) { setColumnError(await res.text() || "Failed to add column"); return; }
				setColumnForm(null);
				await loadBoards();
			} catch (e) { setColumnError(e instanceof Error ? e.message : "Failed to add column"); }
		}
	}

	async function handleRenameColumn() {
		const rf = renameForm();
		if (!rf) return;
		setColumnError("");
		const boardId = selectedBoardId();
		if (!boardId) return;
		try {
			const res = await fetch(`/api/boards/${boardId}/columns/${rf.oldName}/rename`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ newName: rf.newName, scope: rf.scope, currentSlug: props.slug }),
			});
			if (!res.ok) { setColumnError(await res.text() || "Failed to rename column"); return; }
			// Rename succeeded on the server. Parse the response to get the
			// canonical new name; fall back to the client-side slug if the
			// response body is not valid JSON.
			let newName = slugifyColumnName(rf.newName);
			try { const result = await res.json(); newName = result.newName ?? newName; } catch (_e) { console.warn("Failed to parse rename response, using client-side slug:", _e); }
			// Also update description if the column form had a description change
			const cf = columnForm();
			if (cf && cf.description !== undefined) {
				try {
					const descRes = await fetch(`/api/boards/${boardId}/columns/${newName}`, {
						method: "PUT",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ description: cf.description }),
					});
					if (!descRes.ok) {
						setColumnError(await descRes.text() || "Failed to update description");
						// Rename succeeded but description failed: close rename dialog,
						// keep column form open with new name so user can retry description
						setRenameForm(null);
						setColumnForm({ ...cf, name: newName, oldName: newName });
						await loadBoards();
						return;
					}
				} catch (descErr) {
					setColumnError(descErr instanceof Error ? descErr.message : "Failed to update description");
					setRenameForm(null);
					setColumnForm({ ...cf, name: newName, oldName: newName });
					await loadBoards();
					return;
				}
			}
			setRenameForm(null);
			setColumnForm(null);
			await loadBoards();
		} catch (e) { setColumnError(e instanceof Error ? e.message : "Failed to rename column"); }
	}

	async function handleDeleteColumn() {
		const dc = deleteConfirm();
		if (!dc || dc.type !== "column") return;
		setColumnError("");
		const boardId = selectedBoardId();
		if (!boardId) return;
		try {
			const res = await fetch(`/api/boards/${boardId}/columns/${dc.id}`, { method: "DELETE" });
			if (!res.ok) { setColumnError(await res.text() || "Failed to delete column"); return; }
			setDeleteConfirm(null);
			await loadBoards();
		} catch (e) { setColumnError(e instanceof Error ? e.message : "Failed to delete column"); }
	}

	async function handleReorderColumns(orderedNames: string[]) {
		const boardId = selectedBoardId();
		if (!boardId) return;
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
			const res = await fetch(`/api/projects/${props.slug}/launcher-config/board-id`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ boardId }),
			});
			if (!res.ok) { setError(await res.text() || "Failed to save"); return false; }
			await loadConfig();
			return true;
		} catch (e) { setError(e instanceof Error ? e.message : "Failed to save"); return false; }
	}

	async function handleSetProjectBoard() {
		const pbc = projectBoardConfirm();
		if (!pbc) return;
		if (await handleBoardIdChange(pbc.id)) setProjectBoardConfirm(null);
	}

	function columnNameValidation(): string {
		const cf = columnForm();
		if (!cf) return "";
		const slugified = slugifyColumnName(cf.name);
		if (!slugified) return cf.name.trim() ? "Name resolves to empty after slugification" : "";
		if (slugified === "undefined") return 'Name "undefined" is reserved';
		const board = selectedBoard();
		if (!board) return "";
		const existing = board.columns.map(c => c.name);
		const allowSame = cf.mode === "edit" ? cf.oldName : undefined;
		const others = allowSame ? existing.filter(n => n !== allowSame) : existing;
		if (others.includes(slugified)) return `Name "${slugified}" already exists`;
		return "";
	}

	const columnReorder = createListReorder<ColumnDefinition>({
		items: () => selectedBoard()?.columns ?? [],
		idOf: (c) => c.name,
		onReorder: (orderedNames) => {
			const board = selectedBoard();
			if (!board) return;
			// Optimistic update
			const colMap = new Map(board.columns.map(c => [c.name, c]));
			const newColumns = orderedNames.map(n => colMap.get(n)!);
			setBoards(prev => prev.map(b => b.id === board.id ? { ...b, columns: newColumns } : b));
			handleReorderColumns(orderedNames);
		},
	});

	// Skills span two configs (user + project) merged into one ordered list, so a
	// drag can't be expressed as a per-list reorder. Instead each skill carries a
	// fractional `order`; dropping a skill sets it to the midpoint of its new
	// neighbours, which only rewrites the one moved skill in its own config.
	const skillReorder = createListReorder<MergedSkill>({
		items: () => config()?.skills ?? [],
		idOf: (s) => s.name,
		onReorder: (orderedNames, dragged) => {
			const cfg = config();
			if (!cfg) return;
			const orderOf = (name: string) => cfg.skills.find(s => s.name === name)?.order;
			const newIndex = orderedNames.indexOf(dragged.name);
			const before = newIndex > 0 ? orderOf(orderedNames[newIndex - 1]) : undefined;
			const after = newIndex < orderedNames.length - 1 ? orderOf(orderedNames[newIndex + 1]) : undefined;
			const newOrder = midpointOrder(before, after);
			// Optimistic update: reorder the displayed list and stamp the new order.
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
			const res = await fetch(`${itemEndpoint("skill", scope)}/reorder`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name, order }),
			});
			if (!res.ok) { setError(await res.text() || "Failed to reorder"); return; }
			await loadConfig();
		} catch (e) { setError(e instanceof Error ? e.message : "Failed to reorder"); }
	}

	useModEnterSubmit({ onSubmit: submitForm, disabled: () => !form()?.name.trim(), active: () => !!form() });
	useModEnterSubmit({ onSubmit: handleSaveColumn, disabled: () => !columnForm()?.name.trim() || !!columnNameValidation(), active: () => !!columnForm() && !renameForm() });
	useModEnterSubmit({ onSubmit: handleRenameColumn, disabled: () => false, active: () => !!renameForm() });
	useModEnterSubmit({ onSubmit: handleCreateBoard, disabled: () => !boardForm()?.name.trim(), active: () => !!boardForm() });

	return (<>
		<FloatingPanelRoot
			open={props.open}
			onOpenChange={(d) => { if (!d.open) props.onOpenChange(false); }}
			defaultSize={{ width: 672, height: Math.floor((globalThis.window?.innerHeight ?? 800) * 0.8) }}
			minSize={{ width: 400, height: 300 }}
			persistRect
		>
		<TabsRoot value={activeTab()} onValueChange={(d) => setActiveTab(d.value)}>
			<FloatingPanelHeader>
				<FloatingPanelDragTrigger class="flex flex-col gap-3">
					<div class="flex items-start justify-between">
						<FloatingPanelTitle>Settings</FloatingPanelTitle>
						<div class="flex items-center gap-1">
							<button data-no-drag onClick={() => fetch("/api/open-config-dir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "app" }) })} class="px-2 py-1 text-xs text-muted-foreground hover:text-foreground" title="Open user config directory">User&#8599;</button>
							<button data-no-drag onClick={() => fetch("/api/open-config-dir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "project", slug: props.slug }) })} class="px-2 py-1 text-xs text-muted-foreground hover:text-foreground" title="Open project config directory">Project&#8599;</button>
							<button data-no-drag onClick={() => fetch("/api/open-config-dir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "worktree", slug: props.slug }) })} class="px-2 py-1 text-xs text-muted-foreground hover:text-foreground" title="Open worktrees directory">Worktrees&#8599;</button>
							<FloatingPanelCloseTrigger>
								<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
							</FloatingPanelCloseTrigger>
						</div>
					</div>
					<div data-no-drag class="-mx-4 -mb-4">
						<TabsList>
							<TabsTrigger value="general">General</TabsTrigger>
							<TabsTrigger value="templates">Prompts</TabsTrigger>
							<TabsTrigger value="skills">Skills</TabsTrigger>
							<TabsTrigger value="profiles">Launch</TabsTrigger>
							<TabsTrigger value="columns" data-testid="tab-columns">Columns</TabsTrigger>
						</TabsList>
					</div>
				</FloatingPanelDragTrigger>
			</FloatingPanelHeader>

			<FloatingPanelBody>
				<div class="flex-1 overflow-auto px-6 py-4">
								<Show when={error()}><div class="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error()}</div></Show>
								<Show when={loading() && !config()}><p class="text-sm text-muted-foreground">Loading...</p></Show>

								<Show when={config()}>
									{(cfg) => (<>
										<GeneralTab
											config={cfg()}
											boards={boards()}
											worktreeRootPath={worktreeRootPath()}
											setWorktreeRootPath={setWorktreeRootPath}
											saveWorktreeRootPath={saveWorktreeRootPath}
											conflictPrompt={conflictPrompt()}
											setConflictPrompt={setConflictPrompt}
											saveConflictResolution={saveConflictResolution}
											onProjectBoard={setProjectBoardConfirm}
											setError={setError}
										/>
										<PromptsTab config={cfg()} startAdd={startAdd} startEdit={startEdit} deleteItem={deleteItem} />
										<SkillsTab config={cfg()} skillReorder={skillReorder} startAdd={startAdd} startEdit={startEdit} deleteItem={deleteItem} />
										<LaunchTab config={cfg()} startAdd={startAdd} startEdit={startEdit} deleteItem={deleteItem} />
										<ColumnsTab
											config={cfg()}
											boards={boards()}
											columnError={columnError()}
											setColumnError={setColumnError}
											selectedBoardId={selectedBoardId()}
											selectedBoard={selectedBoard()}
											columnReorder={columnReorder}
											setBoardOverride={setBoardOverride}
											onProjectBoard={setProjectBoardConfirm}
											setBoardForm={setBoardForm}
											setColumnForm={setColumnForm}
											setDeleteConfirm={setDeleteConfirm}
										/>
									</>)}
								</Show>
							</div>
			</FloatingPanelBody>
		</TabsRoot>

			<FloatingPanelResizeTrigger axis="s" />
			<FloatingPanelResizeTrigger axis="w" />
			<FloatingPanelResizeTrigger axis="e" />
			<FloatingPanelResizeTrigger axis="n" />
			<FloatingPanelResizeTrigger axis="ne" />
			<FloatingPanelResizeTrigger axis="nw" />
			<FloatingPanelResizeTrigger axis="sw" />
			<FloatingPanelResizeTrigger axis="se">
				<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12"><path d="M10 2v8H2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
			</FloatingPanelResizeTrigger>
		</FloatingPanelRoot>

		<ItemFormDialog form={form()} setForm={setForm} onSubmit={submitForm} />

		<ColumnFormDialog
			columnForm={columnForm()}
			setColumnForm={setColumnForm}
			renameActive={!!renameForm()}
			columnError={columnError()}
			validation={columnNameValidation()}
			onSubmit={handleSaveColumn}
		/>

		<RenameColumnDialog
			renameForm={renameForm()}
			setRenameForm={setRenameForm}
			columnError={columnError()}
			onRename={handleRenameColumn}
		/>

		<BoardFormDialog
			boardForm={boardForm()}
			setBoardForm={setBoardForm}
			columnError={columnError()}
			onCreate={handleCreateBoard}
		/>

		<DeleteConfirmDialog
			deleteConfirm={deleteConfirm()}
			setDeleteConfirm={setDeleteConfirm}
			onDeleteBoard={handleDeleteBoard}
			onDeleteColumn={handleDeleteColumn}
		/>

		<ProjectBoardConfirmDialog
			projectBoardConfirm={projectBoardConfirm()}
			setProjectBoardConfirm={setProjectBoardConfirm}
			onConfirm={handleSetProjectBoard}
		/>
	</>);
}
