import { createSignal, createMemo, createEffect, useContext } from "solid-js";
import { revalidate, useAction } from '@solidjs/router';
import { TabsContent } from "../ui/tabs";
import { ScopeBadge } from "./launcher-settings-rows.js";
import DeleteProjectDialog from "../project/DeleteProjectDialog.js";
import ErrorDialog from '../shared/ErrorDialog.js';
import { errorPayload, type ErrorInfo } from "~/core/shared/errors.js";
import { SettingsFolderField } from "./settings-folder-field.js";
import { AppConfigContext } from '../config/app-config-storage.js';
import { LauncherConfigContext } from './shared-launcher-config-storage.js';
import { ProjectLauncherConfigContext } from './project-launcher-config-storage.js';
import { getProjectLauncherMetadata } from './launcher-api.js';
import { mergeLauncherConfigs } from '~/core/launcher/launcher-config-data.js';
import { setProjectPath as setProjectPathAction, setTicketsLocation } from '../project/project-api.js';

export function MiscTab(props: {
	open: boolean;
	projectSlug: string;
	onDeleteProject?: (projectSlug: string) => Promise<{ error?: string }>;
}) {
	const appConfig = useContext(AppConfigContext)!;
	const sharedConfig = useContext(LauncherConfigContext)!;
	const projectConfig = useContext(ProjectLauncherConfigContext)!;
	const metadata = createMemo(() => getProjectLauncherMetadata(props.projectSlug));
	const config = createMemo(() => mergeLauncherConfigs(sharedConfig.get(), projectConfig.get()));
	const [error, setError] = createSignal<ErrorInfo | null>(null);
	const [deleteOpen, setDeleteOpen] = createSignal(false);
	const [nameDraft, setProjectName] = createSignal<string>();
	const [pathDraft, setProjectPath] = createSignal<string>();
	const [ticketsPathDraft, setTicketsPath] = createSignal<string>();
	const [ticketsBranchDraft, setTicketsBranch] = createSignal<string>();
	const [worktreeDraft, setWorktreeRootPath] = createSignal<string>();
	const [branchDraft, setBranchPrefix] = createSignal<string>();
	const [promptDraft, setConflictPrompt] = createSignal<string>();
	const projectName = () => nameDraft()
		?? appConfig.get().projects.find(p => p.projectSlug === props.projectSlug)?.name ?? '';
	const projectPath = () => pathDraft() ?? metadata().projectPath;
	const ticketsPath = () => ticketsPathDraft() ?? metadata().worktreeDir;
	const ticketsBranch = () => ticketsBranchDraft() ?? metadata().ticketsBranch ?? '';
	const worktreeRootPath = () => worktreeDraft() ?? config().worktreeRootPath ?? '';
	const branchPrefix = () => branchDraft() ?? config().branchPrefix ?? '';
	const conflictPrompt = () => promptDraft() ?? config().conflictResolutionPrompt;
	const [savingProjectPath, setSavingProjectPath] = createSignal(false);
	const [savingTicketsLocation, setSavingTicketsLocation] = createSignal(false);
	const runSetProjectPath = useAction(setProjectPathAction);
	const runSetTicketsLocation = useAction(setTicketsLocation);
	createEffect(() => props.open, open => {
		if (!open) return;
		setProjectName(); setProjectPath(); setTicketsPath(); setTicketsBranch();
		setWorktreeRootPath(); setBranchPrefix(); setConflictPrompt(); setError(null);
	});

	async function saveProjectName() {
		setError(null);
		const name = projectName().trim() || undefined;
		const result = await appConfig.update(current => ({
			...current, projects: current.projects.map(project => project.projectSlug === props.projectSlug
				? { ...project, name } : project),
		}));
		if (result.type === 'Failure') setError({ title: 'Save failed', description: result.error });
	}
	async function saveOverride(key: 'worktreeRootPath' | 'branchPrefix' | 'conflictResolutionPrompt', value: string) {
		setError(null);
		const result = await projectConfig.update(current => ({ ...current, [key]: value.trim() || undefined }));
		if (result.type === 'Failure') setError({ title: 'Save failed', description: result.error });
	}
	async function saveProjectPath(path = projectPath()) {
		if (savingProjectPath() || path.trim() === metadata().projectPath) return;
		setSavingProjectPath(true); setError(null);
		try {
			const result = await runSetProjectPath(props.projectSlug, path);
			if (!result.ok) { setError({ title: 'Save failed', description: result.message }); return; }
			setProjectPath(result.path);
			await revalidate(['launcher-metadata', 'project-page', 'project-sync-status']);
		} catch (e) { setError(errorPayload(e, 'Save failed')); }
		finally { setSavingProjectPath(false); }
	}
	async function saveTicketsLocation(kind: 'path' | 'branch', value: string) {
		const saved = kind === 'path' ? metadata().worktreeDir : metadata().ticketsBranch ?? '';
		if (savingTicketsLocation() || value.trim() === saved) return;
		setSavingTicketsLocation(true); setError(null);
		try {
			const result = await runSetTicketsLocation(props.projectSlug, { kind, value });
			if (!result.ok) { setError({ title: 'Save failed', description: result.message }); return; }
			if (kind === 'path') setTicketsPath(result.value); else setTicketsBranch(result.value);
			await revalidate('launcher-metadata');
		} catch (e) { setError(errorPayload(e, 'Save failed')); }
		finally { setSavingTicketsLocation(false); }
	}

	return (<>
		<TabsContent value="misc">
			<div class="space-y-6">
				<section>
					<label class="field-label">Project name <ScopeBadge scope="project" /></label>
					<input type="text" value={projectName()} onInput={e => setProjectName(e.currentTarget.value)}
						onBlur={saveProjectName} onKeyDown={e => { if (e.key === 'Enter') saveProjectName(); }}
						class="input input-sm" data-testid="launcher-settings-misc-project-name-input" />
				</section>
				<SettingsFolderField label="Project repo folder" testId="launcher-settings-misc-project-path"
					value={projectPath()} setValue={setProjectPath} save={saveProjectPath}
					saving={savingProjectPath()} setError={setError} />
				<SettingsFolderField label="Tickets folder" testId="launcher-settings-misc-tickets-path"
					value={ticketsPath()} setValue={setTicketsPath}
					save={(path = ticketsPath()) => saveTicketsLocation('path', path)}
					saving={savingTicketsLocation()} setError={setError} />
				<section>
					<label class="field-label" for="tickets-branch">
						Tickets branch <ScopeBadge scope="project" />
					</label>
					<input id="tickets-branch" type="text" value={ticketsBranch()}
						onInput={e => setTicketsBranch(e.currentTarget.value)}
						onBlur={() => saveTicketsLocation('branch', ticketsBranch())}
						onKeyDown={e => { if (e.key === 'Enter') saveTicketsLocation('branch', ticketsBranch()); }}
						disabled={savingTicketsLocation()} class="input input-sm"
						data-testid="launcher-settings-misc-tickets-branch-input" />
				</section>
				<SettingsFolderField label="Agent worktree root path" testId="launcher-settings-misc-worktree"
					value={worktreeRootPath()} setValue={setWorktreeRootPath} saving={false}
					save={(path = worktreeRootPath()) => saveOverride('worktreeRootPath', path)} setError={setError} />
				<section>
					<label class="field-label">Branch prefix <ScopeBadge scope="project" /></label>
					<input type="text" value={branchPrefix()} onInput={e => setBranchPrefix(e.currentTarget.value)}
						onBlur={() => saveOverride('branchPrefix', branchPrefix())}
						onKeyDown={e => { if (e.key === 'Enter') saveOverride('branchPrefix', branchPrefix()); }}
						class="input input-sm" placeholder="No prefix"
						data-testid="launcher-settings-misc-branch-prefix-input" />
				</section>
				<section>
					<label class="field-label">Conflict resolution prompt <ScopeBadge scope="project" /></label>
					<textarea value={conflictPrompt()} onInput={e => setConflictPrompt(e.currentTarget.value)}
						onBlur={() => saveOverride('conflictResolutionPrompt', conflictPrompt())}
						class="input min-h-[80px]" placeholder="Prompt for resolving merge conflicts..."
						data-testid="launcher-settings-misc-conflict-prompt" />
				</section>
				{props.onDeleteProject && (
					<section class="border-t border-border pt-6">
						<button type="button" onClick={() => setDeleteOpen(true)} class="btn-destructive"
							data-testid="launcher-settings-delete-project">Delete project</button>
						<DeleteProjectDialog open={deleteOpen()} onOpenChange={setDeleteOpen}
							projectSlug={props.projectSlug} onSubmit={props.onDeleteProject} />
					</section>
				)}
			</div>
		</TabsContent>
		<ErrorDialog error={error()} onClose={() => setError(null)} />
	</>);
}
