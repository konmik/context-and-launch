import { Show, For } from "solid-js";
import { TabsContent } from "./ui/tabs";
import type { MergedLauncherConfig } from "~/server/launcher-config.js";
import { ItemRow } from "./launcher-settings-rows.js";
import type { ItemType, Scope } from "./launcher-settings-dialogs.js";

export function PromptsTab(props: {
	config: MergedLauncherConfig;
	startAdd: (itemType: ItemType) => void;
	startEdit: (itemType: ItemType, scope: Scope, name: string, text: string) => void;
	deleteItem: (itemType: ItemType, scope: Scope, name: string) => void;
}) {
	return (
		<TabsContent value="templates">
			<div class="space-y-6">
				<section>
					<div class="mb-2 flex items-center justify-between">
						<h3 class="text-sm font-semibold">Prompts</h3>
						<button onClick={() => props.startAdd("template")} class="btn-primary btn-sm">Add</button>
					</div>
					<Show when={props.config.templates.length > 0} fallback={<p class="py-3 text-center text-sm text-muted-foreground">No prompts configured.</p>}>
						<div class="space-y-2">
							<For each={props.config.templates}>{(item) => <ItemRow scope={item.scope} name={item.name} detail={item.text} onEdit={() => props.startEdit("template", item.scope, item.name, item.text)} onDelete={() => props.deleteItem("template", item.scope, item.name)} />}</For>
						</div>
					</Show>
				</section>
			</div>
		</TabsContent>
	);
}
