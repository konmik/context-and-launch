import { Show, For } from "solid-js";
import { TabsContent } from "../ui/tabs";
import type { MergedLauncherConfig } from "~/server/launcher/launcher-config.js";
import { ItemRow } from "./launcher-settings-rows.js";
import type { ItemType, Scope } from "./launcher-settings-dialogs.js";

export function LaunchTab(props: {
	config: MergedLauncherConfig;
	startAdd: (itemType: ItemType) => void;
	startEdit: (itemType: ItemType, scope: Scope, name: string, text: string) => void;
	deleteItem: (itemType: ItemType, scope: Scope, name: string) => void;
}) {
	return (
		<TabsContent value="profiles">
			<div class="space-y-6">
				<section>
					<div class="mb-2 flex items-center justify-between">
						<h3 class="text-sm font-semibold">Profiles</h3>
						<button onClick={() => props.startAdd("profile")} class="btn-primary btn-sm">Add</button>
					</div>
					<Show when={props.config.profiles.length > 0} fallback={<p class="py-3 text-center text-sm text-muted-foreground">No profiles configured.</p>}>
						<div class="space-y-2">
							<For each={props.config.profiles}>{(item) => <ItemRow scope={item.scope} name={item.name} detail={item.command} onEdit={() => props.startEdit("profile", item.scope, item.name, item.command)} onDelete={() => props.deleteItem("profile", item.scope, item.name)} />}</For>
						</div>
					</Show>
				</section>
				<section>
					<div class="mb-2 flex items-center justify-between">
						<h3 class="text-sm font-semibold">Shortcuts</h3>
						<button onClick={() => props.startAdd("shortcut")} class="btn-primary btn-sm">Add</button>
					</div>
					<Show when={props.config.shortcuts.length > 0} fallback={<p class="py-3 text-center text-sm text-muted-foreground">No shortcuts configured.</p>}>
						<div class="space-y-2">
							<For each={props.config.shortcuts}>{(item) => <ItemRow scope={item.scope} name={item.name} detail={item.command} onEdit={() => props.startEdit("shortcut", item.scope, item.name, item.command)} onDelete={() => props.deleteItem("shortcut", item.scope, item.name)} />}</For>
						</div>
					</Show>
				</section>
			</div>
		</TabsContent>
	);
}
