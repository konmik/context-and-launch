import { Show } from "solid-js";
import { FloatingPanelRoot, FloatingPanelHeader, FloatingPanelBody, FloatingPanelDragTrigger, FloatingPanelResizeTrigger, FloatingPanelCloseTrigger, FloatingPanelTitle } from "../ui/floating-panel";
import { TabsRoot, TabsList, TabsTrigger } from "../ui/tabs";
import { useModEnterSubmit } from "~/lib/use-mod-enter-submit";
import { GeneralTab } from "./launcher-settings-general-tab.js";
import { PromptsTab } from "./launcher-settings-prompts-tab.js";
import { SkillsTab } from "./launcher-settings-skills-tab.js";
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
import { createLauncherSettingsState } from "./launcher-settings-state.js";

interface LauncherSettingsProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	slug: string;
}

export default function LauncherSettings(props: LauncherSettingsProps) {
	const s = createLauncherSettingsState(props);

	useModEnterSubmit({ onSubmit: s.submitForm, disabled: () => !s.form()?.name.trim(), active: () => !!s.form() });
	useModEnterSubmit({ onSubmit: s.handleSaveColumn, disabled: () => !s.columnForm()?.name.trim() || !!s.columnNameValidation(), active: () => !!s.columnForm() && !s.renameForm() });
	useModEnterSubmit({ onSubmit: s.handleRenameColumn, disabled: () => false, active: () => !!s.renameForm() });
	useModEnterSubmit({ onSubmit: s.handleCreateBoard, disabled: () => !s.boardForm()?.name.trim(), active: () => !!s.boardForm() });

	return (<>
		<FloatingPanelRoot
			open={props.open}
			onOpenChange={(d) => { if (!d.open) props.onOpenChange(false); }}
			defaultSize={{ width: 672, height: Math.floor((globalThis.window?.innerHeight ?? 800) * 0.8) }}
			minSize={{ width: 400, height: 300 }}
			persistRect
		>
		<TabsRoot value={s.activeTab()} onValueChange={(d) => s.setActiveTab(d.value)}>
			<FloatingPanelHeader>
				<FloatingPanelDragTrigger class="flex flex-col gap-3">
					<div class="flex items-start justify-between">
						<FloatingPanelTitle>Settings</FloatingPanelTitle>
						<div class="flex items-center gap-1">
							<button data-no-drag onClick={() => fetch("/api/open-config-dir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "app" }) })} class="px-2 py-1 text-xs text-muted-foreground hover:text-foreground" title="Open user config directory">User&#8599;</button>
							<button data-no-drag onClick={() => fetch("/api/open-config-dir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "project", slug: props.slug }) })} class="px-2 py-1 text-xs text-muted-foreground hover:text-foreground" title="Open project config directory">Project&#8599;</button>
							<button data-no-drag onClick={() => fetch("/api/open-config-dir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "worktree", slug: props.slug }) })} class="px-2 py-1 text-xs text-muted-foreground hover:text-foreground" title="Open worktrees directory">Worktrees&#8599;</button>
							<FloatingPanelCloseTrigger>
								<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
							</FloatingPanelCloseTrigger>
						</div>
					</div>
					<div data-no-drag class="-mx-4 -mb-4">
						<TabsList>
							<TabsTrigger value="general">General</TabsTrigger>
							<TabsTrigger value="templates">Prompts</TabsTrigger>
							<TabsTrigger value="skills">Skills</TabsTrigger>
							<TabsTrigger value="profiles">Launch</TabsTrigger>
							<TabsTrigger value="columns" data-testid="tab-columns">Columns</TabsTrigger>
						</TabsList>
					</div>
				</FloatingPanelDragTrigger>
			</FloatingPanelHeader>

			<FloatingPanelBody>
				<div class="flex-1 overflow-auto px-6 py-4">
								<Show when={s.error()}><div class="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{s.error()}</div></Show>
								<Show when={s.loading() && !s.config()}><p class="text-sm text-muted-foreground">Loading...</p></Show>

								<Show when={s.config()}>
									{(cfg) => (<>
										<GeneralTab
											config={cfg()}
											boards={s.boards()}
											worktreeRootPath={s.worktreeRootPath()}
											setWorktreeRootPath={s.setWorktreeRootPath}
											saveWorktreeRootPath={s.saveWorktreeRootPath}
											conflictPrompt={s.conflictPrompt()}
											setConflictPrompt={s.setConflictPrompt}
											saveConflictResolution={s.saveConflictResolution}
											onProjectBoard={s.setProjectBoardConfirm}
											setError={s.setError}
										/>
										<PromptsTab config={cfg()} startAdd={s.startAdd} startEdit={s.startEdit} deleteItem={s.deleteItem} />
										<SkillsTab config={cfg()} skillReorder={s.skillReorder} startAdd={s.startAdd} startEdit={s.startEdit} deleteItem={s.deleteItem} />
										<LaunchTab config={cfg()} startAdd={s.startAdd} startEdit={s.startEdit} deleteItem={s.deleteItem} />
										<ColumnsTab
											config={cfg()}
											boards={s.boards()}
											columnError={s.columnError()}
											setColumnError={s.setColumnError}
											selectedBoardId={s.selectedBoardId()}
											selectedBoard={s.selectedBoard()}
											columnReorder={s.columnReorder}
											setBoardOverride={s.setBoardOverride}
											onProjectBoard={s.setProjectBoardConfirm}
											setBoardForm={s.setBoardForm}
											setColumnForm={s.setColumnForm}
											setDeleteConfirm={s.setDeleteConfirm}
										/>
									</>)}
								</Show>
							</div>
			</FloatingPanelBody>
		</TabsRoot>

			<FloatingPanelResizeTrigger axis="s" />
			<FloatingPanelResizeTrigger axis="w" />
			<FloatingPanelResizeTrigger axis="e" />
			<FloatingPanelResizeTrigger axis="n" />
			<FloatingPanelResizeTrigger axis="ne" />
			<FloatingPanelResizeTrigger axis="nw" />
			<FloatingPanelResizeTrigger axis="sw" />
			<FloatingPanelResizeTrigger axis="se">
				<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12"><path d="M10 2v8H2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
			</FloatingPanelResizeTrigger>
		</FloatingPanelRoot>

		<ItemFormDialog form={s.form()} setForm={s.setForm} onSubmit={s.submitForm} />
		<ColumnFormDialog columnForm={s.columnForm()} setColumnForm={s.setColumnForm} renameActive={!!s.renameForm()} columnError={s.columnError()} validation={s.columnNameValidation()} onSubmit={s.handleSaveColumn} />
		<RenameColumnDialog renameForm={s.renameForm()} setRenameForm={s.setRenameForm} columnError={s.columnError()} onRename={s.handleRenameColumn} />
		<BoardFormDialog boardForm={s.boardForm()} setBoardForm={s.setBoardForm} columnError={s.columnError()} onCreate={s.handleCreateBoard} />
		<DeleteConfirmDialog deleteConfirm={s.deleteConfirm()} setDeleteConfirm={s.setDeleteConfirm} onDeleteBoard={s.handleDeleteBoard} onDeleteColumn={s.handleDeleteColumn} />
		<ProjectBoardConfirmDialog projectBoardConfirm={s.projectBoardConfirm()} setProjectBoardConfirm={s.setProjectBoardConfirm} onConfirm={s.handleSetProjectBoard} />
	</>);
}
