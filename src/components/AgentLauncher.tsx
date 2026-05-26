import { createSignal, createEffect, on, Show, For } from "solid-js";
import { Dialog } from "@ark-ui/solid";
import { Portal } from "solid-js/web";
import type { TicketInfo, MergedLauncherConfig, ErrorInfo, LauncherColumnDefaults } from "~/types.js";
import ErrorDialog from "./ErrorDialog.js";

interface AgentLauncherProps {
	slug: string;
	ticket: TicketInfo;
	config: MergedLauncherConfig | null;
	onDefaultsChange: (patch: Partial<LauncherColumnDefaults>) => void;
	useWorktree: boolean;
}

export default function AgentLauncher(props: AgentLauncherProps) {
	const [selectedTemplate, setSelectedTemplate] = createSignal("");
	const [selectedProfile, setSelectedProfile] = createSignal("");
	const [checkedSkills, setCheckedSkills] = createSignal<Set<string>>(new Set());
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
				} else {
					setSelectedTemplate(cfg.templates[0]?.name ?? "");
					setSelectedProfile(cfg.profiles[0]?.name ?? "");
					setCheckedSkills(new Set<string>());
				}
			}
		)
	);

	function toggleSkill(name: string) {
		const current = new Set(checkedSkills());
		if (current.has(name)) current.delete(name);
		else current.add(name);
		setCheckedSkills(current);
		props.onDefaultsChange({ checkedSkills: [...current] });
	}

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
									<div class="flex flex-col gap-1">
										<For each={cfg().skills}>
											{(skill) => (
												<label class="flex items-center gap-2 text-sm">
													<input type="checkbox" checked={checkedSkills().has(skill.name)} onChange={() => toggleSkill(skill.name)} class="rounded border-input" />
													{skill.name}
												</label>
											)}
										</For>
									</div>
								</div>
							</Show>
							<button onClick={() => launchAgent()} disabled={launching()} class="btn-primary">Run</button>
						</div>
					</div>
				)}
			</Show>

			<ErrorDialog error={errorInfo()} onClose={() => setErrorInfo(null)} />

			<Dialog.Root open={!!behindRemoteMsg()} onOpenChange={(d) => { if (!d.open) setBehindRemoteMsg(""); }}>
				<Portal>
					<Dialog.Backdrop />
					<Dialog.Positioner>
						<Dialog.Content class="max-w-sm">
							<Dialog.Title class="sr-only">Behind Remote</Dialog.Title>
							<p class="mb-4 text-sm">{behindRemoteMsg()}</p>
							<div class="flex justify-end gap-2">
								<button onClick={() => setBehindRemoteMsg("")} class="btn-secondary">Cancel</button>
								<button onClick={pullAndRetry} disabled={launching()} class="btn-primary">Pull & Retry</button>
							</div>
						</Dialog.Content>
					</Dialog.Positioner>
				</Portal>
			</Dialog.Root>

			<Dialog.Root open={!!dirtyWorktreeMsg()} onOpenChange={(d) => { if (!d.open) setDirtyWorktreeMsg(""); }}>
				<Portal>
					<Dialog.Backdrop />
					<Dialog.Positioner>
						<Dialog.Content class="max-w-sm">
							<Dialog.Title class="sr-only">Uncommitted Changes</Dialog.Title>
							<p class="mb-4 text-sm">{dirtyWorktreeMsg()}</p>
							<div class="flex justify-end gap-2">
								<button onClick={() => setDirtyWorktreeMsg("")} class="btn-secondary">Cancel</button>
								<button onClick={() => { setDirtyWorktreeMsg(""); launchAgent({ force: true }); }} disabled={launching()} class="btn-primary">Launch Anyway</button>
							</div>
						</Dialog.Content>
					</Dialog.Positioner>
				</Portal>
			</Dialog.Root>
		</div>
	);
}
