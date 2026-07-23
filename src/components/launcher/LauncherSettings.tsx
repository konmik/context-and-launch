import { Show, createSignal, createEffect } from "solid-js";
import X from "lucide-solid/icons/x";
import {
	FloatingWindow, FloatingWindowHeader, FloatingPanelBody,
	FloatingPanelCloseTrigger, FloatingPanelTitle,
} from "../ui/floating-panel";
import { TabsRoot, TabsList, TabsTrigger } from "../ui/tabs";
import { useModEnterSubmit } from "~/lib/use-mod-enter-submit";
import { openConfigDir } from "../shared/shared-api.js";
import { MiscTab } from "./launcher-settings-misc-tab.js";
import { PromptsTab } from "./launcher-settings-prompts-tab.js";
import { LaunchTab } from "./launcher-settings-launch-tab.js";
import { ColumnsTab } from "./launcher-settings-columns-tab.js";
import {
	ItemFormDialog,
	ColumnFormDialog,
	RenameColumnDialog,
	BoardFormDialog,
	DeleteConfirmDialog,
	ProjectBoardConfirmDialog,
} from "./launcher-settings-dialogs.js";
import {
	createLauncherSettingsState,
	type LauncherSettingsController,
} from "./launcher-settings-state.js";
import ErrorDialog from "../shared/ErrorDialog.js";
import { createCommandTemplateSettingsState } from './command-template-settings-state.js';
import { CommandTemplatesTab } from './launcher-settings-command-templates-tab.js';

interface LauncherSettingsProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projectSlug: string;
	onDeleteProject?: (projectSlug: string) => Promise<{ error?: string }>;
	ctrl?: LauncherSettingsController;
}

export default function LauncherSettings(props: LauncherSettingsProps) {
	const s = props.ctrl ?? createLauncherSettingsState(props);
	const commandTemplates = createCommandTemplateSettingsState(props);

	const [visitedTabs, setVisitedTabs] = createSignal<Set<string>>(new Set([s.activeTab()]));
	createEffect(() => {
		const tab = s.activeTab();
		setVisitedTabs((prev) => prev.has(tab) ? prev : new Set(prev).add(tab));
	});
	const visited = (tab: string) => visitedTabs().has(tab);

	const defaultSize = {
		width: 672,
		height: Math.floor((globalThis.window?.innerHeight ?? 800) * 0.8),
	};

	useModEnterSubmit({
		onSubmit: s.submitForm,
		disabled: () => !s.form()?.name.trim(),
		active: () => !!s.form(),
	});
	useModEnterSubmit({
		onSubmit: s.handleSaveColumn,
		disabled: () => !s.columnForm()?.name.trim() || !!s.columnNameValidation(),
		active: () => !!s.columnForm() && !s.renameForm(),
	});
	useModEnterSubmit({
		onSubmit: s.handleRenameColumn,
		disabled: () => false,
		active: () => !!s.renameForm(),
	});
	useModEnterSubmit({
		onSubmit: s.handleCreateBoard,
		disabled: () => !s.boardForm()?.name.trim(),
		active: () => !!s.boardForm(),
	});

	return (<>
		<FloatingWindow
			open={props.open}
			onOpenChange={(d) => { if (!d.open) props.onOpenChange(false); }}
			defaultSize={defaultSize}
			minSize={{ width: 400, height: 300 }}
			persistRect
		>
		<TabsRoot value={s.activeTab()} onValueChange={(d) => s.setActiveTab(d.value)}>
			<FloatingWindowHeader
				title={<FloatingPanelTitle>Settings</FloatingPanelTitle>}
				actions={<>
					<button
						data-testid="launcher-settings-open-user-config"
						onClick={() => openConfigDir("app")}
						class="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
						title="Open user config directory"
					>User&#8599;</button>
					<button
						data-testid="launcher-settings-open-project-config"
						onClick={() => openConfigDir("project", props.projectSlug)}
						class="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
						title="Open project config directory"
					>Project&#8599;</button>
					<FloatingPanelCloseTrigger data-testid="launcher-settings-close-button">
						<X size={16} />
					</FloatingPanelCloseTrigger>
				</>}
			>
				<div class="-mx-4 -mb-4">
					<TabsList>
						<TabsTrigger
							value="profiles"
							data-testid="launcher-settings-tab-launch"
						>Launch</TabsTrigger>
						<TabsTrigger
							value="templates"
							data-testid="launcher-settings-tab-prompts"
						>Prompt Templates</TabsTrigger>
						<TabsTrigger
							value="command-templates"
							data-testid="launcher-settings-tab-command-templates"
						>Command Templates</TabsTrigger>
						<TabsTrigger
							value="misc"
							data-testid="launcher-settings-tab-misc"
						>Misc</TabsTrigger>
						<TabsTrigger
							value="columns"
							data-testid="launcher-settings-tab-columns"
						>Columns</TabsTrigger>
					</TabsList>
				</div>
			</FloatingWindowHeader>

			<FloatingPanelBody>
				<div class="flex-1 overflow-auto px-6 py-4">
								<Show when={s.loading() && !s.config()}>
									<p class="text-sm text-muted-foreground">Loading...</p>
								</Show>

								<Show when={s.config()}>
									{(cfg) => (<>
										<Show when={visited("misc")}>
											<MiscTab
												projectName={s.projectName()}
												setProjectName={s.setProjectName}
												saveProjectName={s.saveProjectName}
												worktreeRootPath={s.worktreeRootPath()}
												setWorktreeRootPath={s.setWorktreeRootPath}
												saveWorktreeRootPath={s.saveWorktreeRootPath}
												branchPrefix={s.branchPrefix()}
												setBranchPrefix={s.setBranchPrefix}
												saveBranchPrefix={s.saveBranchPrefix}
												conflictPrompt={s.conflictPrompt()}
												setConflictPrompt={s.setConflictPrompt}
												saveConflictResolution={s.saveConflictResolution}
												setError={s.setError}
												projectSlug={props.projectSlug}
												onDeleteProject={props.onDeleteProject}
											/>
										</Show>
										<Show when={visited("templates")}>
											<PromptsTab
												config={cfg()}
												templateReorder={s.templateReorder}
												skillReorder={s.skillReorder}
												startAdd={s.startAdd}
												startEdit={s.startEdit}
												deleteItem={s.deleteItem}
											/>
										</Show>
										<Show when={visited("profiles")}>
											<LaunchTab
												config={cfg()}
												profileReorder={s.profileReorder}
												shortcutReorder={s.shortcutReorder}
												startAdd={s.startAdd}
												startEdit={s.startEdit}
												deleteItem={s.deleteItem}
											/>
										</Show>
										<Show when={visited("columns")}>
											<ColumnsTab
												projectBoardId={s.projectBoardId()}
												boards={s.boards()}
												selectedBoardId={s.selectedBoardId()}
												selectedBoard={s.selectedBoard()}
												columnReorder={s.columnReorder}
												setBoardOverride={s.setBoardOverride}
												onProjectBoard={s.setProjectBoardConfirm}
												setBoardForm={s.setBoardForm}
												setColumnForm={s.setColumnForm}
												setDeleteConfirm={s.setDeleteConfirm}
												setColumnDialogError={s.setColumnDialogError}
											/>
										</Show>
									</>)}
								</Show>
								<Show when={visited("command-templates")}>
									<CommandTemplatesTab controller={commandTemplates} />
								</Show>
							</div>
			</FloatingPanelBody>
		</TabsRoot>
		</FloatingWindow>

		<ItemFormDialog
			form={s.form()}
			setForm={s.setForm}
			onSubmit={s.submitForm}
		/>
		<ColumnFormDialog
			columnForm={s.columnForm()}
			setColumnForm={s.setColumnForm}
			renameActive={!!s.renameForm()}
			columnError={s.columnDialogError()}
			validation={s.columnNameValidation()}
			onSubmit={s.handleSaveColumn}
		/>
		<RenameColumnDialog
			renameForm={s.renameForm()}
			setRenameForm={s.setRenameForm}
			columnError={s.columnDialogError()}
			onRename={s.handleRenameColumn}
		/>
		<BoardFormDialog
			boardForm={s.boardForm()}
			setBoardForm={s.setBoardForm}
			columnError={s.columnDialogError()}
			onCreate={s.handleCreateBoard}
		/>
		<DeleteConfirmDialog
			deleteConfirm={s.deleteConfirm()}
			setDeleteConfirm={s.setDeleteConfirm}
			onDeleteBoard={s.handleDeleteBoard}
			onDeleteColumn={s.handleDeleteColumn}
		/>
		<ProjectBoardConfirmDialog
			projectBoardConfirm={s.projectBoardConfirm()}
			setProjectBoardConfirm={s.setProjectBoardConfirm}
			onConfirm={s.handleSetProjectBoard}
		/>
		<ErrorDialog error={s.error()} onClose={() => s.setError(null)} />
		<ErrorDialog
			error={commandTemplates.error()}
			onClose={() => commandTemplates.setError(null)}
		/>
	</>);
}
