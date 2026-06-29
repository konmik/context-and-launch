import { createSignal } from "solid-js";
import { TabsContent } from "../ui/tabs";
import { ScopeBadge } from "./launcher-settings-rows.js";
import DeleteProjectDialog from "../project/DeleteProjectDialog.js";
import { pickDirectory } from "../shared/shared-api.js";

export function MiscTab(props: {
	projectName: string;
	setProjectName: (v: string) => void;
	saveProjectName: () => void;
	worktreeRootPath: string;
	setWorktreeRootPath: (v: string) => void;
	saveWorktreeRootPath: () => void;
	branchPrefix: string | undefined;
	setBranchPrefix: (v: string | undefined) => void;
	saveBranchPrefix: () => void;
	conflictPrompt: string;
	setConflictPrompt: (v: string) => void;
	saveConflictResolution: () => void;
	setError: (v: string) => void;
	projectSlug?: string;
	onDeleteProject?: (projectSlug: string) => Promise<{ error?: string }>;
}) {
	const [deleteOpen, setDeleteOpen] = createSignal(false);

	return (
		<TabsContent value="misc">
			<div class="space-y-6">
				<section>
					<h3 class="mb-2 text-sm font-semibold">Project name <ScopeBadge scope="project" /></h3>
					<input
						type="text"
						value={props.projectName}
						onInput={(e) => props.setProjectName(e.currentTarget.value)}
						onBlur={props.saveProjectName}
						onKeyDown={(e) => {
							if (e.key === "Enter") props.saveProjectName();
						}}
						class="input input-sm"
						data-testid="launcher-settings-misc-project-name-input"
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
							data-testid="launcher-settings-misc-worktree-input"
						/>
						<button
							type="button"
							data-testid="launcher-settings-misc-worktree-browse"
							onClick={async () => {
								try {
									const result = await pickDirectory(props.worktreeRootPath);
									if ("path" in result) {
										props.setWorktreeRootPath(result.path);
										props.saveWorktreeRootPath();
									} else if ("error" in result) {
										props.setError(result.error);
									}
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
					<h3 class="mb-2 text-sm font-semibold">Branch prefix <ScopeBadge scope="project" /></h3>
					<input
						type="text"
						value={props.branchPrefix ?? ""}
						onInput={(e) => props.setBranchPrefix(e.currentTarget.value || undefined)}
						onBlur={props.saveBranchPrefix}
						onKeyDown={(e) => {
							if (e.key === "Enter") props.saveBranchPrefix();
						}}
						class="input input-sm"
						placeholder="No prefix"
						data-testid="launcher-settings-misc-branch-prefix-input"
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
						data-testid="launcher-settings-misc-conflict-prompt"
					/>
				</section>
				{props.onDeleteProject && props.projectSlug && (
					<section class="border-t border-border pt-6">
						<button
							type="button"
							onClick={() => setDeleteOpen(true)}
							class="btn-destructive"
							data-testid="launcher-settings-delete-project"
						>Delete project</button>
						<DeleteProjectDialog
							open={deleteOpen()}
							onOpenChange={setDeleteOpen}
							projectSlug={props.projectSlug}
							onSubmit={props.onDeleteProject}
						/>
					</section>
				)}
			</div>
		</TabsContent>
	);
}
