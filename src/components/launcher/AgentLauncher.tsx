import { Show, For } from "solid-js";
import {
	DragDropProvider, DragDropSensors, SortableProvider,
	createSortable, closestCenter,
} from "@thisbeyond/solid-dnd";
import { DialogRoot, DialogTitle } from "../ui/dialog";
import type { MergedLauncherConfig, LauncherColumnDefaults } from "~/core/launcher/launcher-config.js";
import ErrorDialog from "../shared/ErrorDialog.js";
import { DragPreview, DragGrip, NameDragOverlay, DND_ACTIVE_CLASS } from "../board/dnd-shared.js";
import type { AgentLauncherController } from "./agent-launcher-controller.js";

type MergedSkill = MergedLauncherConfig["skills"][number];

interface AgentLauncherProps {
	config: MergedLauncherConfig | null;
	onDefaultsChange: (patch: Partial<LauncherColumnDefaults>) => void;
	ctrl: AgentLauncherController;
}

function SortableLauncherSkill(props: {
	skill: MergedSkill;
	checked: boolean;
	isActive: boolean;
	onToggle: () => void;
}) {
	const sortable = createSortable(props.skill.name);
	return (
		<div
			ref={sortable.ref}
			data-testid="launcher-skill-row"
			data-skill-name={props.skill.name}
			classList={{ [DND_ACTIVE_CLASS]: props.isActive }}
			class="flex items-center gap-2"
		>
			<DragGrip gripProps={sortable.dragActivators} testId="launcher-skill-drag-handle" />
			<label class="flex items-center gap-2 text-sm">
				<input
					type="checkbox"
					checked={props.checked}
					onChange={props.onToggle}
					class="rounded border-input"
					data-testid="ticket-detail-launcher-skill-checkbox"
					data-skill-name={props.skill.name}
				/>
				{props.skill.name}
			</label>
		</div>
	);
}

function LauncherSkillDropPreview(props: { skill: MergedSkill }) {
	return (
		<DragPreview class="flex items-center gap-2">
			<DragGrip testId="launcher-skill-drag-handle" />
			<span class="text-sm">{props.skill.name}</span>
		</DragPreview>
	);
}

export default function AgentLauncher(props: AgentLauncherProps) {
	const c = props.ctrl;

	return (
		<div class="flex h-full flex-col gap-4 overflow-auto px-4 pb-4">
			<Show when={props.config} fallback={<p class="text-sm text-muted-foreground">Loading config...</p>}>
				{(cfg) => (
					<div class="flex w-full flex-col gap-4">
						<div class="flex flex-col gap-4">
							<div>
								<label class="mb-1 block text-sm text-muted-foreground">Agent</label>
								<select
									value={c.selectedProfile()}
									onChange={(e) => {
										c.setSelectedProfile(e.currentTarget.value);
										props.onDefaultsChange({ profileName: e.currentTarget.value });
									}}
									class="input input-sm"
									data-testid="ticket-detail-launcher-profile-select"
								>
									<For each={cfg().profiles}>
									{(p) => <option value={p.name}>{p.name}</option>}
								</For>
								</select>
							</div>
							<div>
								<label class="mb-1 block text-sm text-muted-foreground">Prompt Template</label>
								<select
									value={c.selectedTemplate()}
									onChange={(e) => {
										c.setSelectedTemplate(e.currentTarget.value);
										props.onDefaultsChange({ templateName: e.currentTarget.value });
									}}
									class="input input-sm"
									data-testid="ticket-detail-launcher-template-select"
								>
									<For each={cfg().templates}>
									{(t) => <option value={t.name}>{t.name}</option>}
								</For>
								</select>
							</div>
							<Show when={cfg().skills.length > 0}>
								<div>
									<label class="mb-1 block text-sm text-muted-foreground">Skills</label>
									<DragDropProvider
										onDragStart={c.skillReorder.onDragStart}
										onDragOver={c.skillReorder.onDragOver}
										onDragEnd={c.skillReorder.onDragEnd}
										collisionDetector={closestCenter}
									>
										<DragDropSensors />
										<SortableProvider ids={c.orderedSkills().map(s => s.name)}>
											<div class="flex flex-col gap-1">
												<For each={c.orderedSkills()}>
													{(skill, i) => (
														<>
															<Show when={
																c.skillReorder.dropPreview()?.insertBefore === i()
															}>
																<LauncherSkillDropPreview
																	skill={c.skillReorder.dropPreview()!.item}
																/>
															</Show>
															<SortableLauncherSkill
																skill={skill}
																checked={c.checkedSkills().has(skill.name)}
																isActive={c.skillReorder.activeId() === skill.name}
																onToggle={() => c.toggleSkill(skill.name)}
															/>
														</>
													)}
												</For>
												<Show when={
												c.skillReorder.dropPreview()?.insertBefore === c.orderedSkills().length
											}>
													<LauncherSkillDropPreview
														skill={c.skillReorder.dropPreview()!.item}
													/>
												</Show>
											</div>
										</SortableProvider>
										<NameDragOverlay nameOf={
											(id) => c.orderedSkills().find(s => s.name === id)?.name
										} />
									</DragDropProvider>
								</div>
							</Show>
						</div>
					</div>
				)}
			</Show>

			<ErrorDialog error={c.errorInfo()} onClose={() => c.setErrorInfo(null)} />

			<Show when={c.warningMsg()}>
				<div
					class="flex items-center justify-between rounded bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200"
					data-testid="ticket-detail-launcher-warning"
				>
					<span>{c.warningMsg()}</span>
					<button
						onClick={() => c.setWarningMsg("")}
						class="ml-2 shrink-0 text-yellow-200/60 hover:text-yellow-200"
						data-testid="ticket-detail-launcher-warning-dismiss"
					>&times;</button>
				</div>
			</Show>

			<DialogRoot open={!!c.dirtyWorktreeMsg()} onOpenChange={() => c.setDirtyWorktreeMsg("")} class="max-w-sm">
				<DialogTitle class="sr-only">Uncommitted Changes</DialogTitle>
				<p class="mb-4 text-sm">{c.dirtyWorktreeMsg()}</p>
				<div class="flex justify-end gap-2">
					<button
						onClick={() => c.setDirtyWorktreeMsg("")}
						class="btn-secondary"
						data-testid="ticket-detail-launcher-dirty-cancel"
					>Cancel</button>
					<button
				onClick={() => {
					c.setDirtyWorktreeMsg("");
					c.launchAgent({ force: true });
				}}
				disabled={c.launching()}
				class="btn-primary"
				data-testid="ticket-detail-launcher-dirty-launch-anyway"
			>Launch Anyway</button>
				</div>
			</DialogRoot>
		</div>
	);
}
