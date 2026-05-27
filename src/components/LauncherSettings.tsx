import { createSignal, createEffect, createMemo, onCleanup, on, Show, For, Index } from "solid-js";
import {
	DragDropProvider,
	DragDropSensors,
	DragOverlay,
	SortableProvider,
	createSortable,
	closestCenter,
} from "@thisbeyond/solid-dnd";
import { DialogRoot, DialogTitle, DialogCloseTrigger } from "./ui/dialog";
import { FloatingPanelRoot, FloatingPanelHeader, FloatingPanelBody, FloatingPanelDragTrigger, FloatingPanelResizeTrigger, FloatingPanelCloseTrigger, FloatingPanelTitle } from "./ui/floating-panel";
import { TabsRoot, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import type { MergedLauncherConfig, BoardDefinition, ColumnDefinition } from "~/types.js";
import { useModEnterSubmit, modEnterHint } from "~/lib/use-mod-enter-submit";
import { slugifyColumnName } from "~/lib/slugify.js";
import { DragPreview, DragOverlayCard, DND_ACTIVE_CLASS } from "./dnd-shared.js";
import { createListReorder, midpointOrder } from "./list-reorder.js";

interface LauncherSettingsProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	slug: string;
}

type ItemType = "template" | "skill" | "profile" | "shortcut";
type Scope = "app" | "project";
type MergedSkill = MergedLauncherConfig["skills"][number];

interface ItemFormState {
	mode: "add" | "edit";
	itemType: ItemType;
	scope: Scope;
	name: string;
	text: string;
	oldName?: string;
}

interface ColumnFormState {
	mode: "add" | "edit";
	name: string;
	description: string;
	oldName?: string;
}

interface RenameFormState {
	oldName: string;
	newName: string;
	scope: "all" | "current" | "none";
}

function GripIcon() {
	return (
		<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/></svg>
	);
}

function DragGrip(props: { gripProps?: Record<string, unknown>; testId: string }) {
	return (
		<span {...(props.gripProps ?? {})} class="cursor-grab text-muted-foreground" data-testid={props.testId}>
			<GripIcon />
		</span>
	);
}

function ScopeBadge(props: { scope: string }) {
	return <span class={`rounded px-1.5 py-0.5 text-xs ${props.scope === "app" ? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" : "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"}`}>{props.scope === "app" ? "User" : "Project"}</span>;
}

// Shared layout for every settings row (columns, skills, prompts, ...): same
// border, padding, and flex. Drag-reorderable rows add a grip via DragGrip.
const ROW_CLASS = "flex items-center justify-between rounded-md border border-border px-3 py-2";

function ColumnRowBody(props: {
	column: ColumnDefinition;
	gripProps?: Record<string, unknown>;
	onEdit?: () => void;
	onDelete?: () => void;
}) {
	return (
		<>
			<div class="flex min-w-0 flex-1 items-center gap-2">
				<DragGrip gripProps={props.gripProps} testId="column-drag-handle" />
				<div class="min-w-0 flex-1">
					<span class="text-sm font-medium">{props.column.name}</span>
					{props.column.description && (
						<p class="mt-0.5 truncate text-xs text-muted-foreground">{props.column.description}</p>
					)}
				</div>
			</div>
			<div class="ml-2 flex shrink-0 gap-1">
				<button onClick={props.onEdit} class="btn-secondary btn-sm">Edit</button>
				<button onClick={props.onDelete} class="btn-secondary btn-sm text-destructive hover:bg-destructive hover:text-destructive-foreground">Delete</button>
			</div>
		</>
	);
}

function SortableColumnRow(props: {
	column: ColumnDefinition;
	isActive: boolean;
	onEdit: () => void;
	onDelete: () => void;
}) {
	const sortable = createSortable(props.column.name);
	return (
		<div
			ref={sortable.ref}
			data-testid="column-row"
			data-column-name={props.column.name}
			classList={{ [DND_ACTIVE_CLASS]: props.isActive }}
			class={ROW_CLASS}
		>
			<ColumnRowBody column={props.column} gripProps={sortable.dragActivators} onEdit={props.onEdit} onDelete={props.onDelete} />
		</div>
	);
}

function ColumnDropPreview(props: { column: ColumnDefinition }) {
	return (
		<DragPreview class={ROW_CLASS}>
			<ColumnRowBody column={props.column} />
		</DragPreview>
	);
}

function ItemRowBody(props: {
	scope: string;
	name: string;
	detail: string;
	grip?: boolean;
	gripProps?: Record<string, unknown>;
	onEdit?: () => void;
	onDelete?: () => void;
}) {
	return (
		<>
			<div class="flex min-w-0 flex-1 items-center gap-2">
				<Show when={props.grip}>
					<DragGrip gripProps={props.gripProps} testId="skill-drag-handle" />
				</Show>
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-2">
						<span class="text-sm font-medium">{props.name}</span>
						<ScopeBadge scope={props.scope} />
					</div>
					<p class="mt-1 truncate text-xs text-muted-foreground">{props.detail}</p>
				</div>
			</div>
			<div class="ml-2 flex shrink-0 gap-1">
				<button onClick={props.onEdit} class="btn-secondary btn-sm">Edit</button>
				<button onClick={props.onDelete} class="btn-secondary btn-sm text-destructive hover:bg-destructive hover:text-destructive-foreground">Delete</button>
			</div>
		</>
	);
}

function SortableSkillRow(props: {
	skill: MergedSkill;
	isActive: boolean;
	onEdit: () => void;
	onDelete: () => void;
}) {
	const sortable = createSortable(props.skill.name);
	return (
		<div
			ref={sortable.ref}
			data-testid="skill-row"
			data-skill-name={props.skill.name}
			classList={{ [DND_ACTIVE_CLASS]: props.isActive }}
			class={ROW_CLASS}
		>
			<ItemRowBody scope={props.skill.scope} name={props.skill.name} detail={props.skill.text} grip gripProps={sortable.dragActivators} onEdit={props.onEdit} onDelete={props.onDelete} />
		</div>
	);
}

function SkillDropPreview(props: { skill: MergedSkill }) {
	return (
		<DragPreview class={ROW_CLASS}>
			<ItemRowBody scope={props.skill.scope} name={props.skill.name} detail={props.skill.text} grip />
		</DragPreview>
	);
}

// The card that floats under the cursor while dragging a row keyed by its name.
// Renders nothing once the id no longer maps to a live item.
function NameDragOverlay(props: { nameOf: (id: string) => string | undefined }) {
	return (
		<DragOverlay>
			{(draggable) => {
				const name = props.nameOf(String(draggable?.id));
				return (
					<Show when={name}>
						{(n) => (
							<DragOverlayCard class="rounded-md border border-border bg-card px-3 py-2">
								<span class="text-sm font-medium">{n()}</span>
							</DragOverlayCard>
						)}
					</Show>
				);
			}}
		</DragOverlay>
	);
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
	const [deleteConfirm, setDeleteConfirm] = createSignal<{ type: "board" | "column"; id: string; name: string } | null>(null);
	const [projectBoardConfirm, setProjectBoardConfirm] = createSignal<{ id: string; name: string } | null>(null);
	const [columnError, setColumnError] = createSignal("");

	const selectedBoardId = createMemo(() => {
		const list = boards();
		const valid = (id: string | null | undefined) => (id && list.some(b => b.id === id) ? id : null);
		return valid(boardOverride()) ?? valid(config()?.boardId) ?? list[0]?.id ?? "";
	});

	const selectedBoard = () => boards().find(b => b.id === selectedBoardId());

	const BoardOptions = (p: { selectedId: string }) => (
		<Index each={boards()}>
			{(b) => <option value={b().id} selected={b().id === p.selectedId}>{b().name}</option>}
		</Index>
	);

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
			setSkillOrder(dragged.scope, dragged.name, newOrder);
		},
	});

	async function setSkillOrder(scope: Scope, name: string, order: number) {
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

	function ItemRow(props: { itemType: ItemType; scope: Scope; name: string; detail: string }) {
		return (
			<div class={ROW_CLASS}>
				<ItemRowBody
					scope={props.scope}
					name={props.name}
					detail={props.detail}
					onEdit={() => startEdit(props.itemType, props.scope, props.name, props.detail)}
					onDelete={() => deleteItem(props.itemType, props.scope, props.name)}
				/>
			</div>
		);
	}

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
										<TabsContent value="general">
											<div class="space-y-6">
												<section>
													<h3 class="mb-2 text-sm font-semibold">Board <ScopeBadge scope="project" /></h3>
													<select
														onChange={(e) => handleBoardIdChange(e.currentTarget.value)}
														class="input input-sm"
														data-testid="board-id-select"
													>
														<BoardOptions selectedId={cfg().boardId ?? boards()[0]?.id ?? ""} />
													</select>
												</section>
												<section>
													<h3 class="mb-2 text-sm font-semibold">Agent worktree root path <ScopeBadge scope="project" /></h3>
													<div class="flex gap-2">
														<input type="text" value={worktreeRootPath()} onInput={(e) => setWorktreeRootPath(e.currentTarget.value)} onBlur={saveWorktreeRootPath} onKeyDown={(e) => { if (e.key === "Enter") saveWorktreeRootPath(); }} class="input input-sm flex-1" placeholder="e.g. ~/.ai-stages/worktrees" />
														<button type="button" onClick={async () => { try { const res = await fetch("/api/pick-directory"); if (!res.ok) return; const { path } = await res.json(); setWorktreeRootPath(path); await saveWorktreeRootPath(); } catch (e) { setError(e instanceof Error ? e.message : "Failed to pick directory"); } }} class="btn-secondary">Browse</button>
													</div>
												</section>
												<section>
													<h3 class="mb-2 text-sm font-semibold">Conflict resolution prompt <ScopeBadge scope="project" /></h3>
													<textarea value={conflictPrompt()} onInput={(e) => setConflictPrompt(e.currentTarget.value)} onBlur={saveConflictResolution} class="input min-h-[80px]" style={{ height: "auto" }} placeholder="Prompt for resolving merge conflicts..." data-testid="conflict-prompt" />
												</section>
											</div>
										</TabsContent>

										<TabsContent value="templates">
											<div class="space-y-6">
												<section>
													<div class="mb-2 flex items-center justify-between">
														<h3 class="text-sm font-semibold">Prompts</h3>
														<button onClick={() => startAdd("template")} class="btn-primary btn-sm">Add</button>
													</div>
													<Show when={cfg().templates.length > 0} fallback={<p class="py-3 text-center text-sm text-muted-foreground">No prompts configured.</p>}>
														<div class="space-y-2">
															<For each={cfg().templates}>{(item) => <ItemRow itemType="template" scope={item.scope} name={item.name} detail={item.text} />}</For>
														</div>
													</Show>
												</section>
											</div>
										</TabsContent>

										<TabsContent value="skills">
											<div class="space-y-6">
												<section>
													<div class="mb-2 flex items-center justify-between">
														<h3 class="text-sm font-semibold">Skills</h3>
														<button onClick={() => startAdd("skill")} class="btn-primary btn-sm">Add</button>
													</div>
													<Show when={cfg().skills.length > 0} fallback={<p class="py-3 text-center text-sm text-muted-foreground">No skills configured.</p>}>
														<DragDropProvider
															onDragStart={skillReorder.onDragStart}
															onDragOver={skillReorder.onDragOver}
															onDragEnd={skillReorder.onDragEnd}
															collisionDetector={closestCenter}
														>
															<DragDropSensors />
															<SortableProvider ids={cfg().skills.map(s => s.name)}>
																<div class="space-y-2">
																	<For each={cfg().skills}>
																		{(skill, i) => (
																			<>
																				<Show when={skillReorder.dropPreview()?.insertBefore === i()}>
																					<SkillDropPreview skill={skillReorder.dropPreview()!.item} />
																				</Show>
																				<SortableSkillRow
																					skill={skill}
																					isActive={skillReorder.activeId() === skill.name}
																					onEdit={() => startEdit("skill", skill.scope, skill.name, skill.text)}
																					onDelete={() => deleteItem("skill", skill.scope, skill.name)}
																				/>
																			</>
																		)}
																	</For>
																	<Show when={skillReorder.dropPreview()?.insertBefore === cfg().skills.length}>
																		<SkillDropPreview skill={skillReorder.dropPreview()!.item} />
																	</Show>
																</div>
															</SortableProvider>
															<NameDragOverlay nameOf={(id) => cfg().skills.find(s => s.name === id)?.name} />
														</DragDropProvider>
													</Show>
													<Show when={cfg().skills.some(s => s.scope === "app")}>
														<p class="mt-2 text-xs text-muted-foreground" data-testid="skill-order-warning">
															Skill order is shared. User skills appear in every project, so reordering one here changes its position in all of them.
														</p>
													</Show>
												</section>
											</div>
										</TabsContent>

										<TabsContent value="profiles">
											<div class="space-y-6">
												<section>
													<div class="mb-2 flex items-center justify-between">
														<h3 class="text-sm font-semibold">Profiles</h3>
														<button onClick={() => startAdd("profile")} class="btn-primary btn-sm">Add</button>
													</div>
													<Show when={cfg().profiles.length > 0} fallback={<p class="py-3 text-center text-sm text-muted-foreground">No profiles configured.</p>}>
														<div class="space-y-2">
															<For each={cfg().profiles}>{(item) => <ItemRow itemType="profile" scope={item.scope} name={item.name} detail={item.command} />}</For>
														</div>
													</Show>
												</section>
												<section>
													<div class="mb-2 flex items-center justify-between">
														<h3 class="text-sm font-semibold">Shortcuts</h3>
														<button onClick={() => startAdd("shortcut")} class="btn-primary btn-sm">Add</button>
													</div>
													<Show when={cfg().shortcuts.length > 0} fallback={<p class="py-3 text-center text-sm text-muted-foreground">No shortcuts configured.</p>}>
														<div class="space-y-2">
															<For each={cfg().shortcuts}>{(item) => <ItemRow itemType="shortcut" scope={item.scope} name={item.name} detail={item.command} />}</For>
														</div>
													</Show>
												</section>
											</div>
										</TabsContent>

										<TabsContent value="columns">
											<div class="space-y-6">
												<Show when={columnError()}><div class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{columnError()}</div></Show>
												<section>
													<div class="mb-2 flex items-center gap-2">
														<select
															onChange={(e) => setBoardOverride(e.currentTarget.value)}
															class="input input-sm flex-1"
															data-testid="board-selector"
														>
															<BoardOptions selectedId={selectedBoardId()} />
														</select>
														<button
															onClick={() => { const b = selectedBoard(); if (b) setProjectBoardConfirm({ id: b.id, name: b.name }); }}
															disabled={config()?.boardId === selectedBoardId()}
															class="btn-secondary btn-sm"
															data-testid="set-project-board-btn"
														>Set as project board</button>
														<button onClick={() => setBoardForm({ name: "" })} class="btn-primary btn-sm" data-testid="add-board-btn">Add Board</button>
														<button
															onClick={() => { const b = selectedBoard(); if (b) setDeleteConfirm({ type: "board", id: b.id, name: b.name }); }}
															disabled={boards().length <= 1}
															class="btn-secondary btn-sm text-destructive hover:bg-destructive hover:text-destructive-foreground"
															data-testid="delete-board-btn"
														>Delete Board</button>
													</div>
												</section>
												<section>
													<div class="mb-2 flex items-center justify-between">
														<h3 class="text-sm font-semibold">Columns</h3>
														<button onClick={() => { setColumnError(""); setColumnForm({ mode: "add", name: "", description: "" }); }} class="btn-primary btn-sm" data-testid="add-column-btn">Add</button>
													</div>
													<Show when={selectedBoard()}>
														{(board) => (
															<Show when={board().columns.length > 0} fallback={<p class="py-3 text-center text-sm text-muted-foreground">No columns. Add one to get started.</p>}>
																<DragDropProvider
																	onDragStart={columnReorder.onDragStart}
																	onDragOver={columnReorder.onDragOver}
																	onDragEnd={columnReorder.onDragEnd}
																	collisionDetector={closestCenter}
																>
																	<DragDropSensors />
																	<SortableProvider ids={board().columns.map(c => c.name)}>
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
																							onEdit={() => { setColumnError(""); setColumnForm({ mode: "edit", name: col.name, description: col.description ?? "", oldName: col.name }); }}
																							onDelete={() => setDeleteConfirm({ type: "column", id: col.name, name: col.name })}
																						/>
																					</>
																				)}
																			</For>
																			<Show when={columnReorder.dropPreview()?.insertBefore === board().columns.length}>
																				<ColumnDropPreview column={columnReorder.dropPreview()!.item} />
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

		{/* Item add/edit dialog (templates, skills, profiles, shortcuts) */}
		<DialogRoot open={!!form()} onOpenChange={() => setForm(null)} class="max-w-lg p-0">
						<Show when={form()}>
							{(f) => (<>
								<div class="flex items-center justify-between border-b border-border px-6 py-4">
									<DialogTitle class="mb-0">
										{f().mode === "add" ? "Add" : "Edit"} {f().itemType === "template" ? "Prompt" : f().itemType === "skill" ? "Skill" : f().itemType === "profile" ? "Launch" : "Shortcut"}
									</DialogTitle>
									<DialogCloseTrigger>
										<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
									</DialogCloseTrigger>
								</div>
								<div class="space-y-3 px-6 py-4">
									<div>
										<label class="mb-1 block text-sm text-muted-foreground">Name</label>
										<input type="text" value={f().name} onInput={(e) => setForm({ ...f(), name: e.currentTarget.value })} class="input input-sm" placeholder={f().itemType === "profile" ? "Launch name" : f().itemType === "skill" ? "Skill name" : f().itemType === "shortcut" ? "Shortcut name" : "Prompt name"} />
									</div>
									<div>
										<label class="mb-1 block text-sm text-muted-foreground">{f().itemType === "shortcut" || f().itemType === "profile" ? "Command" : "Prompt"}</label>
										<textarea value={f().text} onInput={(e) => setForm({ ...f(), text: e.currentTarget.value })} class="input min-h-[120px]" style={{ height: "auto" }} placeholder={f().itemType === "profile" ? "e.g. powershell -File run-agent.ps1" : f().itemType === "shortcut" ? "e.g. code {{projectPath}}" : "Prompt text with {{placeholders}}"} />
										<p class="mt-1 text-xs text-muted-foreground">
											{f().itemType === "profile" ? "{{initialPrompt}} {{windowTitle}} {{appConfigDir}}" : f().itemType === "shortcut" ? "{{ticketDir}} {{ticketSlug}} {{ticketTitle}} {{ticketNumber}} {{ticketStatus}} {{projectPath}} {{projectSlug}} {{launchDir}}" : "{{ticketDir}} {{ticketSlug}} {{ticketTitle}} {{ticketNumber}} {{ticketStatus}} {{projectPath}} {{projectSlug}}"}
										</p>
									</div>
									<Show when={f().mode === "add"}>
										<div>
											<label class="mb-1 block text-sm text-muted-foreground">Scope</label>
											<div class="flex gap-4">
												<label class="flex items-center gap-1.5 text-sm"><input type="radio" name="scope" checked={f().scope === "app"} onChange={() => setForm({ ...f(), scope: "app" })} /> User</label>
												<label class="flex items-center gap-1.5 text-sm"><input type="radio" name="scope" checked={f().scope === "project"} onChange={() => setForm({ ...f(), scope: "project" })} /> Project</label>
											</div>
										</div>
									</Show>
								</div>
								<div class="flex justify-end gap-2 border-t border-border px-6 py-3">
									<button onClick={() => setForm(null)} class="btn-secondary">Cancel</button>
									<button onClick={submitForm} disabled={!f().name.trim()} title={modEnterHint()} class="btn-primary">{f().mode === "add" ? "Add" : "Save"}</button>
								</div>
							</>)}
						</Show>
		</DialogRoot>

		{/* Column add/edit dialog */}
		<DialogRoot open={!!columnForm() && !renameForm()} onOpenChange={() => setColumnForm(null)} class="max-w-lg p-0">
			<Show when={columnForm()}>
				{(cf) => (<>
					<div class="flex items-center justify-between border-b border-border px-6 py-4">
						<DialogTitle class="mb-0">{cf().mode === "add" ? "Add Column" : "Edit Column"}</DialogTitle>
						<DialogCloseTrigger>
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
						</DialogCloseTrigger>
					</div>
					<div class="space-y-3 px-6 py-4">
						<Show when={columnError()}><div class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{columnError()}</div></Show>
						<div>
							<label class="mb-1 block text-sm text-muted-foreground">Name</label>
							<input
								type="text"
								value={cf().name}
								onInput={(e) => setColumnForm({ ...cf(), name: e.currentTarget.value })}
								class="input input-sm"
								data-testid="column-name-input"
								placeholder="e.g. In Progress"
							/>
							<Show when={cf().name.trim()}>
								<p class="mt-1 text-xs text-muted-foreground" data-testid="column-slug-preview">
									Slug: {slugifyColumnName(cf().name)}
								</p>
							</Show>
							<Show when={columnNameValidation()}>
								<p class="mt-1 text-xs text-destructive" data-testid="column-name-error">{columnNameValidation()}</p>
							</Show>
						</div>
						<div>
							<label class="mb-1 block text-sm text-muted-foreground">Description (optional)</label>
							<textarea
								value={cf().description}
								onInput={(e) => setColumnForm({ ...cf(), description: e.currentTarget.value })}
								class="input min-h-[60px]"
								style={{ height: "auto" }}
								data-testid="column-desc-input"
								placeholder="Brief description of this column"
							/>
						</div>
					</div>
					<div class="flex justify-end gap-2 border-t border-border px-6 py-3">
						<button onClick={() => setColumnForm(null)} class="btn-secondary">Cancel</button>
						<button
							onClick={handleSaveColumn}
							disabled={!cf().name.trim() || !!columnNameValidation()}
							title={modEnterHint()}
							class="btn-primary"
							data-testid="column-form-submit"
						>{cf().mode === "add" ? "Add" : "Save"}</button>
					</div>
				</>)}
			</Show>
		</DialogRoot>

		{/* Rename migration scope dialog */}
		<DialogRoot open={!!renameForm()} onOpenChange={() => setRenameForm(null)} class="max-w-lg p-0">
			<Show when={renameForm()}>
				{(rf) => (<>
					<div class="flex items-center justify-between border-b border-border px-6 py-4">
						<DialogTitle class="mb-0">Rename Column</DialogTitle>
						<DialogCloseTrigger>
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
						</DialogCloseTrigger>
					</div>
					<div class="space-y-3 px-6 py-4">
						<Show when={columnError()}><div class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{columnError()}</div></Show>
						<p class="text-sm">
							Renaming "{rf().oldName}" to "{slugifyColumnName(rf().newName)}".
						</p>
						<p class="text-sm text-muted-foreground">
							Update ticket statuses and column defaults?
						</p>
						<div class="space-y-2">
							<label class="flex items-center gap-2 text-sm">
								<input type="radio" name="rename-scope" checked={rf().scope === "all"} onChange={() => setRenameForm({ ...rf(), scope: "all" })} data-testid="rename-scope-all" />
								All projects using this board
							</label>
							<label class="flex items-center gap-2 text-sm">
								<input type="radio" name="rename-scope" checked={rf().scope === "current"} onChange={() => setRenameForm({ ...rf(), scope: "current" })} data-testid="rename-scope-current" />
								Current project only
							</label>
							<label class="flex items-center gap-2 text-sm">
								<input type="radio" name="rename-scope" checked={rf().scope === "none"} onChange={() => setRenameForm({ ...rf(), scope: "none" })} data-testid="rename-scope-none" />
								None (rename column only)
							</label>
						</div>
					</div>
					<div class="flex justify-end gap-2 border-t border-border px-6 py-3">
						<button onClick={() => { setRenameForm(null); }} class="btn-secondary">Cancel</button>
						<button onClick={handleRenameColumn} title={modEnterHint()} class="btn-primary">Rename</button>
					</div>
				</>)}
			</Show>
		</DialogRoot>

		{/* Board add dialog */}
		<DialogRoot open={!!boardForm()} onOpenChange={() => setBoardForm(null)} class="max-w-sm p-0">
			<Show when={boardForm()}>
				{(bf) => (<>
					<div class="flex items-center justify-between border-b border-border px-6 py-4">
						<DialogTitle class="mb-0">Add Board</DialogTitle>
						<DialogCloseTrigger>
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
						</DialogCloseTrigger>
					</div>
					<div class="space-y-3 px-6 py-4">
						<Show when={columnError()}><div class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{columnError()}</div></Show>
						<div>
							<label class="mb-1 block text-sm text-muted-foreground">Board name</label>
							<input
								type="text"
								value={bf().name}
								onInput={(e) => setBoardForm({ name: e.currentTarget.value })}
								class="input input-sm"
								data-testid="board-name-input"
								placeholder="e.g. Development"
							/>
						</div>
					</div>
					<div class="flex justify-end gap-2 border-t border-border px-6 py-3">
						<button onClick={() => setBoardForm(null)} class="btn-secondary">Cancel</button>
						<button onClick={handleCreateBoard} disabled={!bf().name.trim()} title={modEnterHint()} class="btn-primary" data-testid="board-form-submit">Add</button>
					</div>
				</>)}
			</Show>
		</DialogRoot>

		{/* Delete confirmation dialog */}
		<DialogRoot open={!!deleteConfirm()} onOpenChange={() => setDeleteConfirm(null)} class="max-w-sm p-0">
			<Show when={deleteConfirm()}>
				{(dc) => (<>
					<div class="flex items-center justify-between border-b border-border px-6 py-4">
						<DialogTitle class="mb-0">Delete {dc().type === "board" ? "Board" : "Column"}</DialogTitle>
						<DialogCloseTrigger>
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
						</DialogCloseTrigger>
					</div>
					<div class="px-6 py-4">
						<p class="text-sm" data-testid="delete-confirm-message">
							{dc().type === "board"
								? `Delete board "${dc().name}"? This cannot be undone.`
								: `Delete column "${dc().name}"? Tickets with this status will appear in the undefined column.`}
						</p>
					</div>
					<div class="flex justify-end gap-2 border-t border-border px-6 py-3">
						<button onClick={() => setDeleteConfirm(null)} class="btn-secondary">Cancel</button>
						<button
							onClick={dc().type === "board" ? handleDeleteBoard : handleDeleteColumn}
							class="btn-primary bg-destructive text-destructive-foreground hover:bg-destructive/90"
							data-testid="delete-confirm-btn"
						>Delete</button>
					</div>
				</>)}
			</Show>
		</DialogRoot>

		{/* Set-as-project-board confirmation dialog */}
		<DialogRoot open={!!projectBoardConfirm()} onOpenChange={() => setProjectBoardConfirm(null)} class="max-w-sm p-0">
			<Show when={projectBoardConfirm()}>
				{(pbc) => (<>
					<div class="flex items-center justify-between border-b border-border px-6 py-4">
						<DialogTitle class="mb-0">Set Project Board</DialogTitle>
						<DialogCloseTrigger>
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
						</DialogCloseTrigger>
					</div>
					<div class="px-6 py-4">
						<p class="text-sm" data-testid="set-project-board-message">Set "{pbc().name}" as the board for this project? Tickets whose status is not a column in this board will appear in the undefined column and must be updated manually.</p>
					</div>
					<div class="flex justify-end gap-2 border-t border-border px-6 py-3">
						<button onClick={() => setProjectBoardConfirm(null)} class="btn-secondary" data-testid="set-project-board-cancel-btn">Cancel</button>
						<button onClick={handleSetProjectBoard} class="btn-primary" data-testid="set-project-board-confirm-btn">Set board</button>
					</div>
				</>)}
			</Show>
		</DialogRoot>
	</>);
}
