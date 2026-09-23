import { TabsContent } from '../ui/tabs';
import { ItemSection } from './launcher-settings-item-section.js';

export function PromptsTab(props: { open: boolean }) {
	return (
		<TabsContent value="templates">
			<div class="space-y-6">
				<ItemSection
					open={props.open}
					heading="Prompt Templates"
					itemType="template"
					addButtonTestId="launcher-settings-prompts-add-button"
					rowTestId="launcher-settings-prompts-row"
					dragHandleTestId="launcher-settings-prompts-drag-handle"
					editTestId="launcher-settings-prompts-edit-button"
					deleteTestId="launcher-settings-prompts-delete-button"
				/>
				<ItemSection
					open={props.open}
					heading="Skills"
					itemType="skill"
					addButtonTestId="launcher-settings-skills-add-button"
					rowTestId="launcher-settings-skills-row"
					dragHandleTestId="launcher-settings-skills-drag-handle"
					editTestId="launcher-settings-skills-edit-button"
					deleteTestId="launcher-settings-skills-delete-button"
					sharedOrderWarning={
						'Skill order is shared. User skills appear in every project, '
						+ 'so reordering one here changes its position in all of them.'
					}
					sharedOrderWarningTestId="launcher-settings-skills-order-warning"
				/>
			</div>
		</TabsContent>
	);
}
