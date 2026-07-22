import { Show, For } from "solid-js";
import { DragDropProvider, DragDropSensors, SortableProvider, closestCenter } from "@thisbeyond/solid-dnd";
import { TabsContent } from "../ui/tabs";
import type { MergedLauncherConfig } from "~/core/launcher/launcher-config.js";
import { NameDragOverlay } from "../board/dnd-shared.js";
import type { ListReorder } from "../board/list-reorder.js";
import {
	ItemDropPreview,
	SortableItemRow,
	type MergedLauncherItem,
	type MergedSkill,
	type MergedTemplate,
} from "./launcher-settings-rows.js";
import type { ItemType, Scope } from "./launcher-settings-dialogs.js";

export function ItemSection<T extends MergedLauncherItem>(props: {
	heading: string;
	itemType: ItemType;
	items: T[];
	detailOf: (item: T) => string;
	reorder: ListReorder<T>;
	startAdd: (itemType: ItemType) => void;
	startEdit: (itemType: ItemType, scope: Scope, name: string, detail: string) => void;
	deleteItem: (itemType: ItemType, scope: Scope, name: string) => void;
	addButtonTestId?: string;
	rowTestId: string;
	dragHandleTestId: string;
	editTestId?: string;
	deleteTestId?: string;
	sharedOrderWarning?: string;
	sharedOrderWarningTestId?: string;
}) {
	return (
		<section>
			<div class="mb-2 flex items-center justify-between">
				<h3 class="text-sm font-semibold">{props.heading}</h3>
				<button
					onClick={() => props.startAdd(props.itemType)}
					class="btn-primary btn-sm"
					data-testid={props.addButtonTestId}
				>Add</button>
			</div>
			<Show
				when={props.items.length > 0}
				fallback={
					<p class="py-3 text-center text-sm text-muted-foreground">
						No {props.heading.toLowerCase()} configured.
					</p>
				}
			>
				<DragDropProvider
					onDragStart={props.reorder.onDragStart}
					onDragOver={props.reorder.onDragOver}
					onDragEnd={props.reorder.onDragEnd}
					collisionDetector={closestCenter}
				>
					<DragDropSensors />
					<SortableProvider ids={props.items.map(item => item.name)}>
						<div class="space-y-2">
							<For each={props.items}>
								{(item, index) => (<>
									<Show when={props.reorder.dropPreview()?.insertBefore === index()}>
										<ItemDropPreview
											item={props.reorder.dropPreview()!.item}
											detail={props.detailOf(props.reorder.dropPreview()!.item)}
										/>
									</Show>
									<SortableItemRow
										item={item}
										detail={props.detailOf(item)}
										isActive={props.reorder.activeId() === item.name}
										onEdit={() => props.startEdit(
											props.itemType, item.scope, item.name, props.detailOf(item),
										)}
										onDelete={() => props.deleteItem(
											props.itemType, item.scope, item.name,
										)}
										rowTestId={props.rowTestId}
										dragHandleTestId={props.dragHandleTestId}
										editTestId={props.editTestId}
										deleteTestId={props.deleteTestId}
									/>
								</>)}
							</For>
							<Show when={props.reorder.dropPreview()?.insertBefore === props.items.length}>
								<ItemDropPreview
									item={props.reorder.dropPreview()!.item}
									detail={props.detailOf(props.reorder.dropPreview()!.item)}
								/>
							</Show>
						</div>
					</SortableProvider>
					<NameDragOverlay nameOf={(id) => props.items.find(item => item.name === id)?.name} />
				</DragDropProvider>
			</Show>
			<Show when={props.sharedOrderWarning && props.items.some(item => item.scope === "app")}>
				<p
					class="mt-2 text-xs text-muted-foreground"
					data-testid={props.sharedOrderWarningTestId}
				>{props.sharedOrderWarning}</p>
			</Show>
		</section>
	);
}

export function PromptsTab(props: {
	config: MergedLauncherConfig;
	templateReorder: ListReorder<MergedTemplate>;
	skillReorder: ListReorder<MergedSkill>;
	startAdd: (itemType: ItemType) => void;
	startEdit: (itemType: ItemType, scope: Scope, name: string, detail: string) => void;
	deleteItem: (itemType: ItemType, scope: Scope, name: string) => void;
}) {
	return (
		<TabsContent value="templates">
			<div class="space-y-6">
				<ItemSection
					heading="Prompt Templates"
					itemType="template"
					items={props.config.templates}
					detailOf={(t) => t.text}
					reorder={props.templateReorder}
					startAdd={props.startAdd}
					startEdit={props.startEdit}
					deleteItem={props.deleteItem}
					addButtonTestId="launcher-settings-prompts-add-button"
					rowTestId="launcher-settings-prompts-row"
					dragHandleTestId="launcher-settings-prompts-drag-handle"
					editTestId="launcher-settings-prompts-edit-button"
					deleteTestId="launcher-settings-prompts-delete-button"
				/>
				<ItemSection
					heading="Skills"
					itemType="skill"
					items={props.config.skills}
					detailOf={(skill) => skill.text}
					reorder={props.skillReorder}
					startAdd={props.startAdd}
					startEdit={props.startEdit}
					deleteItem={props.deleteItem}
					addButtonTestId="launcher-settings-skills-add-button"
					rowTestId="launcher-settings-skills-row"
					dragHandleTestId="launcher-settings-skills-drag-handle"
					editTestId="launcher-settings-skills-edit-button"
					deleteTestId="launcher-settings-skills-delete-button"
					sharedOrderWarning={
						"Skill order is shared. User skills appear in every project, "
						+ "so reordering one here changes its position in all of them."
					}
					sharedOrderWarningTestId="launcher-settings-skills-order-warning"
				/>
			</div>
		</TabsContent>
	);
}
