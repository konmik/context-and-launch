import { Show, For, type JSX } from "solid-js";
import { TabsContent } from "../ui/tabs";
import type { MergedLauncherConfig } from "~/server/launcher/launcher-config.js";
import { ItemRow } from "./launcher-settings-rows.js";
import type { ItemType, Scope } from "./launcher-settings-dialogs.js";

export function ItemSection<T extends { scope: Scope; name: string }>(props: {
	heading: string;
	itemType: ItemType;
	items: T[];
	detailOf: (item: T) => string;
	startAdd: (itemType: ItemType) => void;
	startEdit: (itemType: ItemType, scope: Scope, name: string, detail: string) => void;
	deleteItem: (itemType: ItemType, scope: Scope, name: string) => void;
	children?: JSX.Element;
}) {
	return (
		<section>
			<div class="mb-2 flex items-center justify-between">
				<h3 class="text-sm font-semibold">{props.heading}</h3>
				<button onClick={() => props.startAdd(props.itemType)} class="btn-primary btn-sm">Add</button>
			</div>
			<Show when={props.items.length > 0} fallback={<p class="py-3 text-center text-sm text-muted-foreground">No {props.heading.toLowerCase()} configured.</p>}>
				<div class="space-y-2">
					<For each={props.items}>{(item) => <ItemRow scope={item.scope} name={item.name} detail={props.detailOf(item)} onEdit={() => props.startEdit(props.itemType, item.scope, item.name, props.detailOf(item))} onDelete={() => props.deleteItem(props.itemType, item.scope, item.name)} />}</For>
				</div>
			</Show>
			{props.children}
		</section>
	);
}

export function PromptsTab(props: {
	config: MergedLauncherConfig;
	startAdd: (itemType: ItemType) => void;
	startEdit: (itemType: ItemType, scope: Scope, name: string, detail: string) => void;
	deleteItem: (itemType: ItemType, scope: Scope, name: string) => void;
}) {
	return (
		<TabsContent value="templates">
			<div class="space-y-6">
				<ItemSection heading="Prompts" itemType="template" items={props.config.templates} detailOf={(t) => t.text} startAdd={props.startAdd} startEdit={props.startEdit} deleteItem={props.deleteItem} />
			</div>
		</TabsContent>
	);
}
