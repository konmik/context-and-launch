import { TabsContent } from "../ui/tabs";
import type { MergedLauncherConfig } from "~/server/launcher/launcher-config.js";
import type { BoardDefinition } from "~/server/project/board-config.js";
import type { BoardRef } from "~/lib/fetch-boards.js";
import { ScopeBadge } from "./launcher-settings-rows.js";
import BoardSelect from "../project/BoardSelect.js";

export function GeneralTab(props: {
	config: MergedLauncherConfig;
	boards: BoardDefinition[];
	worktreeRootPath: string;
	setWorktreeRootPath: (v: string) => void;
	saveWorktreeRootPath: () => void;
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
						value={props.config.boardId ?? props.boards[0]?.id ?? ""}
						onChange={(e) => {
							const newId = e.currentTarget.value;
							const current = props.config.boardId ?? props.boards[0]?.id ?? "";
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
					<h3 class="mb-2 text-sm font-semibold">Agent worktree root path <ScopeBadge scope="project" /></h3>
					<div class="flex gap-2">
						<input
							type="text"
							value={props.worktreeRootPath}
							onInput={(e) => props.setWorktreeRootPath(e.currentTarget.value)}
							onBlur={props.saveWorktreeRootPath}
							onKeyDown={(e) => {
								if (e.key === "Enter") props.saveWorktreeRootPath();
							}}
							class="input input-sm flex-1"
							placeholder="e.g. ~/.context-launch/worktrees"
							data-testid="launcher-settings-general-worktree-input"
						/>
						<button
							type="button"
							data-testid="launcher-settings-general-worktree-browse"
							onClick={async () => {
								try {
									const res = await fetch(
										`/api/pick-directory?path=${encodeURIComponent(props.worktreeRootPath)}`,
									);
									if (res.status === 204) return;
									if (!res.ok) {
										const body = await res.json().catch(() => ({}));
										props.setError(body?.error ?? `Directory picker failed (${res.status})`);
										return;
									}
									const { path } = await res.json();
									props.setWorktreeRootPath(path);
									props.saveWorktreeRootPath();
								} catch (e) {
									props.setError(
										e instanceof Error ? e.message : "Failed to pick directory",
									);
								}
							}}
							class="btn-secondary"
						>Browse</button>
					</div>
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
