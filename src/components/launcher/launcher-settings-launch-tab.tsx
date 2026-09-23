import { TabsContent } from "../ui/tabs";
import { ItemSection } from './launcher-settings-item-section.js';

export function LaunchTab(props: { open: boolean }) {
	return (
		<TabsContent value="profiles">
			<div class="space-y-6">
				<ItemSection
					heading="Agents"
					itemType="profile"
					open={props.open}
					addButtonTestId="launcher-settings-launch-add-profile-button"
					rowTestId="launcher-settings-launch-profile-row"
					dragHandleTestId="launcher-settings-launch-profile-drag-handle"
					editTestId="launcher-settings-launch-profile-edit-button"
					deleteTestId="launcher-settings-launch-profile-delete-button"
				/>
				<ItemSection
					heading="Shortcuts"
					itemType="shortcut"
					open={props.open}
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
