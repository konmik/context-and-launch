import { createSignal } from "solid-js";
import { TabsContent } from "../ui/tabs";
import { ScopeBadge } from "./launcher-settings-rows.js";
import DeleteProjectDialog from "../project/DeleteProjectDialog.js";

export function MiscTab(props: {
	worktreeRootPath: string;
	setWorktreeRootPath: (v: string) => void;
	saveWorktreeRootPath: () => void;
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
