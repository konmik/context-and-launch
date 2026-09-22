import { createSignal } from "solid-js";
import { TabsContent } from "../ui/tabs";
import { ScopeBadge } from "./launcher-settings-rows.js";
import DeleteProjectDialog from "../project/DeleteProjectDialog.js";
import { pickDirectory } from "../shared/directory-picker.js";
import { errorPayload, type ErrorInfo } from "~/core/shared/errors.js";
import { SettingsFolderField } from "./settings-folder-field.js";

export function MiscTab(props: {
	projectName: string;
	setProjectName: (v: string) => void;
	saveProjectName: () => void;
	projectPath: string;
	setProjectPath: (v: string) => void;
	saveProjectPath: (path?: string) => void;
	savingProjectPath: boolean;
	ticketsPath: string;
	setTicketsPath: (v: string) => void;
	saveTicketsPath: (path?: string) => void;
	ticketsBranch: string;
	setTicketsBranch: (v: string) => void;
	saveTicketsBranch: () => void;
	savingTicketsLocation: boolean;
	worktreeRootPath: string;
	setWorktreeRootPath: (v: string) => void;
	saveWorktreeRootPath: (path?: string) => void;
	branchPrefix: string | undefined;
	setBranchPrefix: (v: string | undefined) => void;
	saveBranchPrefix: () => void;
	conflictPrompt: string;
	setConflictPrompt: (v: string) => void;
	saveConflictResolution: () => void;
	setError: (v: ErrorInfo | null) => void;
	projectSlug?: string;
	onDeleteProject?: (projectSlug: string) => Promise<{ error?: string }>;
}) {
	const [deleteOpen, setDeleteOpen] = createSignal(false);

	return (
		<TabsContent value="misc">
			<div class="space-y-6">
				<section>
					<label class="field-label">Project name <ScopeBadge scope="project" /></label>
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
				<SettingsFolderField
					label="Project repo folder"
					testId="launcher-settings-misc-project-path"
					value={props.projectPath}
					setValue={props.setProjectPath}
					save={props.saveProjectPath}
					saving={props.savingProjectPath}
					setError={props.setError}
				/>
				<SettingsFolderField
					label="Tickets folder"
					testId="launcher-settings-misc-tickets-path"
					value={props.ticketsPath}
					setValue={props.setTicketsPath}
					save={props.saveTicketsPath}
					saving={props.savingTicketsLocation}
					setError={props.setError}
				/>
				<section>
					<label class="field-label" for="tickets-branch">
						Tickets branch <ScopeBadge scope="project" />
					</label>
					<input
						id="tickets-branch"
						type="text"
						value={props.ticketsBranch}
						onInput={(e) => props.setTicketsBranch(e.currentTarget.value)}
						onBlur={props.saveTicketsBranch}
						onKeyDown={(e) => { if (e.key === "Enter") props.saveTicketsBranch(); }}
						disabled={props.savingTicketsLocation}
						class="input input-sm"
						data-testid="launcher-settings-misc-tickets-branch-input"
					/>
				</section>
				<section>
					<label class="field-label">Agent worktree root path <ScopeBadge scope="project" /></label>
					<div class="flex gap-2">
						<input
							type="text"
							value={props.worktreeRootPath}
							onInput={(e) => props.setWorktreeRootPath(e.currentTarget.value)}
							onBlur={() => props.saveWorktreeRootPath()}
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
										props.saveWorktreeRootPath(result.path);
									} else if ("error" in result) {
										props.setError({ title: "Browse failed", description: result.error });
									}
								} catch (e) {
									props.setError(errorPayload(e, "Browse failed"));
								}
							}}
							class="btn-secondary"
						>Browse</button>
					</div>
				</section>
				<section>
					<label class="field-label">Branch prefix <ScopeBadge scope="project" /></label>
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
					<label class="field-label">
						Conflict resolution prompt <ScopeBadge scope="project" />
					</label>
					<textarea
						value={props.conflictPrompt}
						onInput={(e) => props.setConflictPrompt(e.currentTarget.value)}
						onBlur={props.saveConflictResolution}
						class="input min-h-[80px]"
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
