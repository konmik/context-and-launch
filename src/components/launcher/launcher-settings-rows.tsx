import { Show, splitProps, type JSX } from "solid-js";
import { createSortable } from "@thisbeyond/solid-dnd";
import { DragGrip, DragPreview, DND_ACTIVE_CLASS } from "../board/dnd-shared.js";
import { joinClass } from "~/lib/class-util";
import type { MergedLauncherConfig } from "~/core/launcher/launcher-config.js";
import type { ColumnDefinition } from "~/core/project/board-config.js";

export type MergedLauncherItem = MergedLauncherConfig[
	"templates" | "skills" | "profiles" | "shortcuts"
][number];
export type MergedTemplate = MergedLauncherConfig["templates"][number];
export type MergedSkill = MergedLauncherConfig["skills"][number];
export type MergedProfile = MergedLauncherConfig["profiles"][number];
export type MergedShortcut = MergedLauncherConfig["shortcuts"][number];

export function ScopeBadge(props: { scope: string }) {
	const cls = props.scope === "app"
		? "bg-muted text-muted-foreground"
		: "bg-primary/15 text-primary";
	return (
		<span class={`label-mono rounded px-1.5 py-0.5 text-xs ${cls}`}>
			{props.scope === "app" ? "User" : "Project"}
		</span>
	);
}

export const CARD_CLASS =
	"settings-card flex items-center justify-between gap-2 rounded-md border border-border p-3";

export function SettingsCard(props: JSX.HTMLAttributes<HTMLDivElement>) {
	const [local, rest] = splitProps(props, ["class", "children"]);
	return (
		<div class={joinClass(CARD_CLASS, local.class)} {...rest}>
			{local.children}
		</div>
	);
}

function CardRowBody(props: {
	name: string;
	detail?: string;
	scope?: string;
	grip?: boolean;
	gripProps?: Record<string, unknown>;
	dragHandleTestId?: string;
	onEdit?: () => void;
	onDelete?: () => void;
	editTestId?: string;
	deleteTestId?: string;
}) {
	return (
		<>
			<div class="flex min-w-0 flex-1 items-center gap-2">
				<Show when={props.grip}>
					<DragGrip
						gripProps={props.gripProps}
						testId={props.dragHandleTestId ?? "launcher-settings-skills-drag-handle"}
					/>
				</Show>
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-2">
						<span class="text-sm font-medium">{props.name}</span>
						<Show when={props.scope}>
							{(scope) => <ScopeBadge scope={scope()} />}
						</Show>
					</div>
					<Show when={props.detail}>
						<p class="mt-1 truncate text-xs text-muted-foreground">{props.detail}</p>
					</Show>
				</div>
			</div>
			<div class="flex shrink-0 gap-1">
				<button
					onClick={props.onEdit}
					class="btn-secondary btn-sm"
					data-testid={props.editTestId}
				>Edit</button>
				<button
					onClick={props.onDelete}
					class={
						"btn-secondary btn-sm text-destructive "
						+ "hover:bg-destructive hover:text-destructive-foreground"
					}
					data-testid={props.deleteTestId}
				>Delete</button>
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
		<SettingsCard
			ref={sortable.ref}
			data-testid="launcher-settings-columns-row"
			data-column-name={props.column.name}
			classList={{ [DND_ACTIVE_CLASS]: props.isActive }}
		>
			<CardRowBody
				name={props.column.name}
				detail={props.column.description}
				grip
				gripProps={sortable.dragActivators}
				dragHandleTestId="launcher-settings-columns-drag-handle"
				onEdit={props.onEdit}
				onDelete={props.onDelete}
				editTestId="launcher-settings-columns-edit-button"
				deleteTestId="launcher-settings-columns-delete-button"
			/>
		</SettingsCard>
	);
}

export function ColumnDropPreview(props: { column: ColumnDefinition }) {
	return (
		<DragPreview class={CARD_CLASS}>
			<CardRowBody name={props.column.name} detail={props.column.description} grip />
		</DragPreview>
	);
}

export function SortableItemRow(props: {
	item: MergedLauncherItem;
	detail: string;
	isActive: boolean;
	onEdit: () => void;
	onDelete: () => void;
	rowTestId: string;
	dragHandleTestId: string;
	editTestId?: string;
	deleteTestId?: string;
}) {
	const sortable = createSortable(props.item.name);
	return (
		<SettingsCard
			ref={sortable.ref}
			data-testid={props.rowTestId}
			data-item-name={props.item.name}
			classList={{ [DND_ACTIVE_CLASS]: props.isActive }}
		>
			<CardRowBody
				scope={props.item.scope}
				name={props.item.name}
				detail={props.detail}
				grip
				gripProps={sortable.dragActivators}
				dragHandleTestId={props.dragHandleTestId}
				onEdit={props.onEdit}
				onDelete={props.onDelete}
				editTestId={props.editTestId}
				deleteTestId={props.deleteTestId}
			/>
		</SettingsCard>
	);
}

export function ItemDropPreview(props: {
	item: MergedLauncherItem;
	detail: string;
}) {
	return (
		<DragPreview class={CARD_CLASS}>
			<CardRowBody
				scope={props.item.scope}
				name={props.item.name}
				detail={props.detail}
				grip
			/>
		</DragPreview>
	);
}
