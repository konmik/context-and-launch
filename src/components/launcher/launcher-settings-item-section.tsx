import { createSignal, createEffect, createMemo, useContext, Show, For } from "solid-js";
import { DragDropProvider } from '~/components/drag/drag-provider.js';
import { NameDragOverlay } from '../board/dnd-shared.js';
import { ItemDropPreview, SortableItemRow, type MergedLauncherItem } from './launcher-settings-rows.js';
import { ItemFormDialog } from './launcher-settings-dialogs.js';
import ErrorDialog from '../shared/ErrorDialog.js';
import { useModEnterSubmit } from '~/lib/use-mod-enter-submit.js';
import { errorPayload, type ErrorInfo } from "~/core/shared/errors.js";
import { createListReorder, midpointOrder } from "../board/list-reorder.js";
import type {
  ItemType, Scope, ItemFormState,
} from "./launcher-settings-dialogs.js";
import { LauncherConfigContext } from './shared-launcher-config-storage.js';
import {
  mergeLauncherConfigs, updateLauncherReferences,
} from '~/core/launcher/launcher-config-data.js';
import { ProjectLauncherConfigContext } from './project-launcher-config-storage.js';

const collections = { template: 'templates', skill: 'skills', profile: 'profiles', shortcut: 'shortcuts' } as const;

export function ItemSection(props: {
	open: boolean;
	heading: string;
	itemType: ItemType;
	addButtonTestId: string;
	rowTestId: string;
	dragHandleTestId: string;
	editTestId: string;
	deleteTestId: string;
	sharedOrderWarning?: string;
	sharedOrderWarningTestId?: string;
}) {
	const sharedConfig = useContext(LauncherConfigContext)!;
	const projectConfig = useContext(ProjectLauncherConfigContext)!;
	const config = createMemo(() => mergeLauncherConfigs(sharedConfig.get(), projectConfig.get()));
	const [error, setError] = createSignal<ErrorInfo | null>(null);
	const [form, setForm] = createSignal<ItemFormState | null>(null);
	const items = () => config()[collections[props.itemType]];
	const detailOf = (item: MergedLauncherItem) => 'text' in item ? item.text : item.command;
	useModEnterSubmit({ onSubmit: submitForm, disabled: () => !form()?.name.trim(), active: () => !!form() });

	createEffect(() => props.open, (open) => {
		if (!open) return;
		setForm(null); setError(null);
	});

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
			const result = await (f.scope === 'app' ? sharedConfig : projectConfig).update(current => {
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
					columnDefaults: updateLauncherReferences(current.columnDefaults, f.itemType, f.oldName!, f.name),
				};
			});
			if (result.type === 'Failure') { setError({ title: 'Save failed', description: result.error }); return; }
			setForm(null);
		} catch (e) { setError(errorPayload(e, "Save failed")); }
	}

	async function deleteItemFn(itemType: ItemType, scope: Scope, name: string) {
		setError(null);
		try {
			const result = await (scope === 'app' ? sharedConfig : projectConfig).update(current => ({
				...current,
				[collections[itemType]]: (current[collections[itemType]] ?? []).filter(item => item.name !== name),
				columnDefaults: updateLauncherReferences(current.columnDefaults, itemType, name, null),
			}));
			if (result.type === 'Failure') setError({ title: 'Delete failed', description: result.error });
		} catch (e) { setError(errorPayload(e, "Delete failed")); }
	}

	const reorder = createListReorder<MergedLauncherItem>({
			items,
			idOf: (item) => item.name,
			onReorder: (orderedNames, dragged) => {
				const orderOf = (name: string) =>
					items().find(item => item.name === name)?.order;
				const newIndex = orderedNames.indexOf(dragged.name);
				const before = newIndex > 0
					? orderOf(orderedNames[newIndex - 1]) : undefined;
				const after = newIndex < orderedNames.length - 1
					? orderOf(orderedNames[newIndex + 1]) : undefined;
				const newOrder = midpointOrder(before, after);
				saveItemOrder(dragged.scope, dragged.name, newOrder);
			},
		});

	async function saveItemOrder(
		scope: Scope,
		name: string,
		order: number,
	) {
		setError(null);
		try {
			const result = await (scope === 'app' ? sharedConfig : projectConfig).update(current => ({
				...current,
				[collections[props.itemType]]: (current[collections[props.itemType]] ?? [])
					.map(item => item.name === name ? { ...item, order } : item),
			}));
			if (result.type === 'Failure') setError({ title: 'Reorder failed', description: result.error });
		} catch (e) { setError(errorPayload(e, "Reorder failed")); }
	}

	return (<>
		<section>
			<div class="mb-2 flex items-center justify-between">
				<h3 class="text-sm font-semibold">{props.heading}</h3>
				<button onClick={() => startAdd(props.itemType)} class="btn-primary btn-sm"
					data-testid={props.addButtonTestId}>Add</button>
			</div>
			<Show when={items().length > 0} fallback={
				<p class="py-3 text-center text-sm text-muted-foreground">
					No {props.heading.toLowerCase()} configured.
				</p>
			}>
				<DragDropProvider onDragStart={reorder.onDragStart}
					onDragOver={reorder.onDragOver} onDragEnd={reorder.onDragEnd}>
					<div class="space-y-2">
						<For each={items()}>{(item, index) => (<>
							<Show when={reorder.dropPreview()?.insertBefore === index()}>
								<ItemDropPreview item={reorder.dropPreview()!.item}
									detail={detailOf(reorder.dropPreview()!.item)} />
							</Show>
							<SortableItemRow item={item} detail={detailOf(item)}
								isActive={reorder.activeId() === item.name}
								onEdit={() => startEdit(props.itemType, item.scope, item.name, detailOf(item))}
								onDelete={() => deleteItemFn(props.itemType, item.scope, item.name)}
								rowTestId={props.rowTestId} dragHandleTestId={props.dragHandleTestId}
								editTestId={props.editTestId} deleteTestId={props.deleteTestId} />
						</>)}</For>
						<Show when={reorder.dropPreview()?.insertBefore === items().length}>
							<ItemDropPreview item={reorder.dropPreview()!.item}
								detail={detailOf(reorder.dropPreview()!.item)} />
						</Show>
					</div>
					<NameDragOverlay nameOf={id => items().find(item => item.name === id)?.name} />
				</DragDropProvider>
			</Show>
			<Show when={props.sharedOrderWarning && items().some(item => item.scope === 'app')}>
				<p class="mt-2 text-xs text-muted-foreground" data-testid={props.sharedOrderWarningTestId}>
					{props.sharedOrderWarning}
				</p>
			</Show>
		</section>
		<ItemFormDialog form={form()} setForm={setForm} onSubmit={submitForm} />
		<ErrorDialog error={error()} onClose={() => setError(null)} />
	</>);
}
