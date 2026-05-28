import { Show, Index } from "solid-js";
import { createSortable } from "@thisbeyond/solid-dnd";
import { DragGrip, DragPreview, DND_ACTIVE_CLASS } from "../board/dnd-shared.js";
import type { MergedLauncherConfig } from "~/server/launcher/launcher-config.js";
import type { BoardDefinition, ColumnDefinition } from "~/server/project/board-config.js";

export type MergedSkill = MergedLauncherConfig["skills"][number];

export function ScopeBadge(props: { scope: string }) {
	return <span class={`rounded px-1.5 py-0.5 text-xs ${props.scope === "app" ? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" : "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"}`}>{props.scope === "app" ? "User" : "Project"}</span>;
}

// Shared layout for every settings row (columns, skills, prompts, ...): same
// border, padding, and flex. Drag-reorderable rows add a grip via DragGrip.
export const ROW_CLASS = "flex items-center justify-between rounded-md border border-border px-3 py-2";

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

export function SortableColumnRow(props: {
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

export function ColumnDropPreview(props: { column: ColumnDefinition }) {
	return (
		<DragPreview class={ROW_CLASS}>
			<ColumnRowBody column={props.column} />
		</DragPreview>
	);
}

export function ItemRowBody(props: {
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

export function SortableSkillRow(props: {
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

export function SkillDropPreview(props: { skill: MergedSkill }) {
	return (
		<DragPreview class={ROW_CLASS}>
			<ItemRowBody scope={props.skill.scope} name={props.skill.name} detail={props.skill.text} grip />
		</DragPreview>
	);
}

export function BoardOptions(props: { boards: BoardDefinition[]; selectedId: string }) {
	return (
		<Index each={props.boards}>
			{(b) => <option value={b().id} selected={b().id === props.selectedId}>{b().name}</option>}
		</Index>
	);
}

export function ItemRow(props: { scope: string; name: string; detail: string; onEdit: () => void; onDelete: () => void }) {
	return (
		<div class={ROW_CLASS}>
			<ItemRowBody scope={props.scope} name={props.name} detail={props.detail} onEdit={props.onEdit} onDelete={props.onDelete} />
		</div>
	);
}
