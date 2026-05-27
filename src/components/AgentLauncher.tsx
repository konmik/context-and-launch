import { createSignal, createEffect, createMemo, on, Show, For } from "solid-js";
import { DragDropProvider, DragDropSensors, SortableProvider, createSortable, closestCenter } from "@thisbeyond/solid-dnd";
import { DialogRoot, DialogTitle } from "./ui/dialog";
import type { TicketInfo, MergedLauncherConfig, ErrorInfo, LauncherColumnDefaults } from "~/types.js";
import ErrorDialog from "./ErrorDialog.js";
import { DragPreview, DragGrip, NameDragOverlay, DND_ACTIVE_CLASS } from "./dnd-shared.js";
import { createListReorder, orderByNameList } from "./list-reorder.js";

type MergedSkill = MergedLauncherConfig["skills"][number];

interface AgentLauncherProps {
	slug: string;
	ticket: TicketInfo;
	config: MergedLauncherConfig | null;
	onDefaultsChange: (patch: Partial<LauncherColumnDefaults>) => void;
	useWorktree: boolean;
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
				<input type="checkbox" checked={props.checked} onChange={props.onToggle} class="rounded border-input" />
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
	const [selectedTemplate, setSelectedTemplate] = createSignal("");
	const [selectedProfile, setSelectedProfile] = createSignal("");
	const [checkedSkills, setCheckedSkills] = createSignal<Set<string>>(new Set());
	const [skillOrder, setSkillOrder] = createSignal<string[]>([]);
	const [launching, setLaunching] = createSignal(false);
	const [errorInfo, setErrorInfo] = createSignal<ErrorInfo | null>(null);
	const [behindRemoteMsg, setBehindRemoteMsg] = createSignal("");
	const [dirtyWorktreeMsg, setDirtyWorktreeMsg] = createSignal("");

	createEffect(
		on(
			() => [props.config, props.ticket.folderName] as const,
			([cfg]) => {
				if (!cfg) return;
				const defaults = cfg.columnDefaults[props.ticket.status];
				if (defaults) {
					setSelectedTemplate(defaults.templateName ?? (cfg.templates[0]?.name ?? ""));
					setSelectedProfile(defaults.profileName ?? (cfg.profiles[0]?.name ?? ""));
					setCheckedSkills(new Set(defaults.checkedSkills));
					setSkillOrder(defaults.skillOrder ?? []);
				} else {
					setSelectedTemplate(cfg.templates[0]?.name ?? "");
					setSelectedProfile(cfg.profiles[0]?.name ?? "");
					setCheckedSkills(new Set<string>());
					setSkillOrder([]);
				}
			}
		)
	);

	const orderedSkills = createMemo(() => orderByNameList(props.config?.skills ?? [], skillOrder()));

	function toggleSkill(name: string) {
		const current = new Set(checkedSkills());
		if (current.has(name)) current.delete(name);
		else current.add(name);
		setCheckedSkills(current);
		props.onDefaultsChange({ checkedSkills: [...current] });
	}

	const skillReorder = createListReorder<MergedSkill>({
		items: orderedSkills,
		idOf: (s) => s.name,
		onReorder: (orderedNames) => {
			setSkillOrder(orderedNames);
			props.onDefaultsChange({ skillOrder: orderedNames });
		},
	});

	function launchBody(extra?: Record<string, unknown>) {
		return JSON.stringify({
			templateName: selectedTemplate(),
			checkedSkills: [...checkedSkills()],
			useWorktree: props.useWorktree,
			profileName: selectedProfile(),
			...extra,
		});
	}

	function ticketAiUrl(action: string) {
		return `/api/projects/${props.slug}/board/tickets/${props.ticket.folderName}/ai/${action}`;
	}

	function textToErrorInfo(text: string, status: number): ErrorInfo {
		try {
			const data = JSON.parse(text);
			if (data.description) return data as ErrorInfo;
			return { description: JSON.stringify(data) };
		} catch {
			return { description: text || `Error ${status}` };
		}
	}

	async function launchAgent(extra?: Record<string, unknown>) {
		setLaunching(true);
		setErrorInfo(null);
		setBehindRemoteMsg("");
		setDirtyWorktreeMsg("");
		try {
			const res = await fetch(ticketAiUrl("run"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: launchBody(extra),
			});
			if (res.status === 409) {
				const responseText = await res.text();
				try {
					const data = JSON.parse(responseText);
					if (data.behindRemote) { setBehindRemoteMsg(data.message); return; }
					if (data.dirtyWorktree) { setDirtyWorktreeMsg(data.message); return; }
				} catch { /* Not JSON */ }
				setErrorInfo(textToErrorInfo(responseText, res.status));
			} else if (!res.ok) {
				setErrorInfo(textToErrorInfo(await res.text(), res.status));
			}
		} catch (e: any) {
			setErrorInfo({ description: e?.message ?? "Network error" });
		} finally {
			setLaunching(false);
		}
	}

	async function pullAndRetry() {
		setLaunching(true);
		setBehindRemoteMsg("");
		setErrorInfo(null);
		try {
			const res = await fetch(ticketAiUrl("pull-and-retry"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: launchBody(),
			});
			if (!res.ok) setErrorInfo(textToErrorInfo(await res.text(), res.status));
		} catch (e: any) {
			setErrorInfo({ description: e?.message ?? "Network error" });
		} finally {
			setLaunching(false);
		}
	}

	return (
		<div class="flex h-full flex-col items-center justify-center gap-4 p-4">
			<Show when={props.config} fallback={<p class="text-sm text-muted-foreground">Loading config...</p>}>
				{(cfg) => (
					<div class="flex w-full max-w-sm flex-col gap-4">
						<div class="flex flex-col gap-4 rounded-md border border-border p-4">
							<div>
								<label class="mb-1 block text-sm text-muted-foreground">Launch</label>
								<select value={selectedProfile()} onChange={(e) => { setSelectedProfile(e.currentTarget.value); props.onDefaultsChange({ profileName: e.currentTarget.value }); }} class="input input-sm">
									<For each={cfg().profiles}>{(p) => <option value={p.name}>{p.name}</option>}</For>
								</select>
							</div>
							<div>
								<label class="mb-1 block text-sm text-muted-foreground">Prompt</label>
								<select value={selectedTemplate()} onChange={(e) => { setSelectedTemplate(e.currentTarget.value); props.onDefaultsChange({ templateName: e.currentTarget.value }); }} class="input input-sm">
									<For each={cfg().templates}>{(t) => <option value={t.name}>{t.name}</option>}</For>
								</select>
							</div>
							<Show when={cfg().skills.length > 0}>
								<div>
									<label class="mb-1 block text-sm text-muted-foreground">Skills</label>
									<DragDropProvider
										onDragStart={skillReorder.onDragStart}
										onDragOver={skillReorder.onDragOver}
										onDragEnd={skillReorder.onDragEnd}
										collisionDetector={closestCenter}
									>
										<DragDropSensors />
										<SortableProvider ids={orderedSkills().map(s => s.name)}>
											<div class="flex flex-col gap-1">
												<For each={orderedSkills()}>
													{(skill, i) => (
														<>
															<Show when={skillReorder.dropPreview()?.insertBefore === i()}>
																<LauncherSkillDropPreview skill={skillReorder.dropPreview()!.item} />
															</Show>
															<SortableLauncherSkill
																skill={skill}
																checked={checkedSkills().has(skill.name)}
																isActive={skillReorder.activeId() === skill.name}
																onToggle={() => toggleSkill(skill.name)}
															/>
														</>
													)}
												</For>
												<Show when={skillReorder.dropPreview()?.insertBefore === orderedSkills().length}>
													<LauncherSkillDropPreview skill={skillReorder.dropPreview()!.item} />
												</Show>
											</div>
										</SortableProvider>
										<NameDragOverlay nameOf={(id) => orderedSkills().find(s => s.name === id)?.name} />
									</DragDropProvider>
								</div>
							</Show>
							<button onClick={() => launchAgent()} disabled={launching()} class="btn-primary">Run</button>
						</div>
					</div>
				)}
			</Show>

			<ErrorDialog error={errorInfo()} onClose={() => setErrorInfo(null)} />

			<DialogRoot open={!!behindRemoteMsg()} onOpenChange={() => setBehindRemoteMsg("")} class="max-w-sm">
				<DialogTitle class="sr-only">Behind Remote</DialogTitle>
				<p class="mb-4 text-sm">{behindRemoteMsg()}</p>
				<div class="flex justify-end gap-2">
					<button onClick={() => setBehindRemoteMsg("")} class="btn-secondary">Cancel</button>
					<button onClick={pullAndRetry} disabled={launching()} class="btn-primary">Pull & Retry</button>
				</div>
			</DialogRoot>

			<DialogRoot open={!!dirtyWorktreeMsg()} onOpenChange={() => setDirtyWorktreeMsg("")} class="max-w-sm">
				<DialogTitle class="sr-only">Uncommitted Changes</DialogTitle>
				<p class="mb-4 text-sm">{dirtyWorktreeMsg()}</p>
				<div class="flex justify-end gap-2">
					<button onClick={() => setDirtyWorktreeMsg("")} class="btn-secondary">Cancel</button>
					<button onClick={() => { setDirtyWorktreeMsg(""); launchAgent({ force: true }); }} disabled={launching()} class="btn-primary">Launch Anyway</button>
				</div>
			</DialogRoot>
		</div>
	);
}
