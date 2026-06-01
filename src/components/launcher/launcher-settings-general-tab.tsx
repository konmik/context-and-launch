import { TabsContent } from "../ui/tabs";
import type { MergedLauncherConfig } from "~/server/launcher/launcher-config.js";
import type { BoardDefinition } from "~/server/project/board-config.js";
import type { BoardRef } from "~/lib/fetch-boards.js";
import { ScopeBadge } from "./launcher-settings-rows.js";
import BoardSelect from "../project/BoardSelect.js";

export function GeneralTab(props: {
	config: MergedLauncherConfig;
	boards: BoardDefinition[];
	conflictPrompt: string;
	setConflictPrompt: (v: string) => void;
	saveConflictResolution: () => void;
	onProjectBoard: (b: BoardRef) => void;
	setError: (v: string) => void;
}) {
	return (
		<TabsContent value="general">
			<div class="space-y-6">
				<section>
					<h3 class="mb-2 text-sm font-semibold">Board <ScopeBadge scope="project" /></h3>
					<BoardSelect
						boards={props.boards}
						value={props.config.boardId}
						onChange={(e) => {
							const newId = e.currentTarget.value;
							const current = props.config.boardId;
							e.currentTarget.value = current;
							if (newId === current) return;
							const b = props.boards.find(x => x.id === newId);
							if (b) props.onProjectBoard({ id: b.id, name: b.name });
						}}
						class="input input-sm"
						testId="launcher-settings-general-board-select"
					/>
				</section>
				<section>
					<h3 class="mb-2 text-sm font-semibold">
						Conflict resolution prompt <ScopeBadge scope="project" />
					</h3>
					<textarea
						value={props.conflictPrompt}
						onInput={(e) => props.setConflictPrompt(e.currentTarget.value)}
						onBlur={props.saveConflictResolution}
						class="input min-h-[80px]"
						style={{ height: "auto" }}
						placeholder="Prompt for resolving merge conflicts..."
						data-testid="launcher-settings-general-conflict-prompt"
					/>
				</section>
			</div>
		</TabsContent>
	);
}
