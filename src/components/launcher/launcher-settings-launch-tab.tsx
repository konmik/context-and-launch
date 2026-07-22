import { TabsContent } from "../ui/tabs";
import type { MergedLauncherConfig } from "~/core/launcher/launcher-config.js";
import type { ItemType, Scope } from "./launcher-settings-dialogs.js";
import { ItemSection } from "./launcher-settings-prompts-tab.js";
import type { ListReorder } from "../board/list-reorder.js";
import type { MergedProfile, MergedShortcut } from "./launcher-settings-rows.js";

export function LaunchTab(props: {
	config: MergedLauncherConfig;
	profileReorder: ListReorder<MergedProfile>;
	shortcutReorder: ListReorder<MergedShortcut>;
	startAdd: (itemType: ItemType) => void;
	startEdit: (itemType: ItemType, scope: Scope, name: string, detail: string) => void;
	deleteItem: (itemType: ItemType, scope: Scope, name: string) => void;
}) {
	return (
		<TabsContent value="profiles">
			<div class="space-y-6">
				<ItemSection
					heading="Agents"
					itemType="profile"
					items={props.config.profiles}
					detailOf={(p) => p.command}
					reorder={props.profileReorder}
					startAdd={props.startAdd}
					startEdit={props.startEdit}
					deleteItem={props.deleteItem}
					addButtonTestId="launcher-settings-launch-add-profile-button"
					rowTestId="launcher-settings-launch-profile-row"
					dragHandleTestId="launcher-settings-launch-profile-drag-handle"
					editTestId="launcher-settings-launch-profile-edit-button"
					deleteTestId="launcher-settings-launch-profile-delete-button"
				/>
				<ItemSection
					heading="Shortcuts"
					itemType="shortcut"
					items={props.config.shortcuts}
					detailOf={(s) => s.command}
					reorder={props.shortcutReorder}
					startAdd={props.startAdd}
					startEdit={props.startEdit}
					deleteItem={props.deleteItem}
					addButtonTestId="launcher-settings-launch-add-shortcut-button"
					rowTestId="launcher-settings-launch-shortcut-row"
					dragHandleTestId="launcher-settings-launch-shortcut-drag-handle"
					editTestId="launcher-settings-launch-shortcut-edit-button"
					deleteTestId="launcher-settings-launch-shortcut-delete-button"
				/>
			</div>
		</TabsContent>
	);
}
