import { TabsContent } from "../ui/tabs";
import type { MergedLauncherConfig } from "~/core/launcher/launcher-config.js";
import type { ItemType, Scope } from "./launcher-settings-dialogs.js";
import { ItemSection } from "./launcher-settings-prompts-tab.js";

export function LaunchTab(props: {
	config: MergedLauncherConfig;
	startAdd: (itemType: ItemType) => void;
	startEdit: (itemType: ItemType, scope: Scope, name: string, detail: string) => void;
	deleteItem: (itemType: ItemType, scope: Scope, name: string) => void;
}) {
	return (
		<TabsContent value="profiles">
			<div class="space-y-6">
				<ItemSection
					heading="Profiles"
					itemType="profile"
					items={props.config.profiles}
					detailOf={(p) => p.command}
					startAdd={props.startAdd}
					startEdit={props.startEdit}
					deleteItem={props.deleteItem}
					addButtonTestId="launcher-settings-launch-add-profile-button"
					editTestId="launcher-settings-launch-profile-edit-button"
					deleteTestId="launcher-settings-launch-profile-delete-button"
				/>
				<ItemSection
					heading="Shortcuts"
					itemType="shortcut"
					items={props.config.shortcuts}
					detailOf={(s) => s.command}
					startAdd={props.startAdd}
					startEdit={props.startEdit}
					deleteItem={props.deleteItem}
					addButtonTestId="launcher-settings-launch-add-shortcut-button"
					editTestId="launcher-settings-launch-shortcut-edit-button"
					deleteTestId="launcher-settings-launch-shortcut-delete-button"
				/>
			</div>
		</TabsContent>
	);
}
