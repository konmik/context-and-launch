import { createSignal, createEffect, on, Show, For } from "solid-js";
import type { TicketInfo, MergedLauncherConfig, ErrorInfo, LauncherColumnDefaults } from "~/types.js";
import ErrorDialog from "./ErrorDialog.js";

interface AgentLauncherProps {
	slug: string;
	ticket: TicketInfo;
	config: MergedLauncherConfig | null;
	onDefaultsChange: (patch: Partial<LauncherColumnDefaults>) => void;
}

export default function AgentLauncher(props: AgentLauncherProps) {
	const [selectedTemplate, setSelectedTemplate] = createSignal("");
	const [selectedProfile, setSelectedProfile] = createSignal("");
	const [checkedSkills, setCheckedSkills] = createSignal<Set<string>>(new Set());
	const [useWorktree, setUseWorktree] = createSignal(props.ticket.useWorktree);
	const [launching, setLaunching] = createSignal(false);
	const [errorInfo, setErrorInfo] = createSignal<ErrorInfo | null>(null);
	const [behindRemoteMsg, setBehindRemoteMsg] = createSignal("");

	createEffect(
		on(
			() => [props.config, props.ticket.folderName] as const,
			([cfg]) => {
				if (!cfg) return;
				setUseWorktree(props.ticket.useWorktree);
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
		if (current.has(name)) {
			current.delete(name);
		} else {
			current.add(name);
		}
		setCheckedSkills(current);
		props.onDefaultsChange({ checkedSkills: [...current] });
	}

	function launchBody() {
		return JSON.stringify({
			templateName: selectedTemplate(),
			checkedSkills: [...checkedSkills()],
			useWorktree: useWorktree(),
			profileName: selectedProfile(),
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

	async function launchAgent() {
		setLaunching(true);
		setErrorInfo(null);
		setBehindRemoteMsg("");
		try {
			const res = await fetch(ticketAiUrl("run"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: launchBody(),
			});
			if (res.status === 409) {
				const responseText = await res.text();
				try {
					const data = JSON.parse(responseText);
					if (data.behindRemote) {
						setBehindRemoteMsg(data.message);
						return;
					}
				} catch {
					// Not JSON -- fall through
				}
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
			if (!res.ok) {
				setErrorInfo(textToErrorInfo(await res.text(), res.status));
			}
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
							<Show when={cfg().worktreeRootPath !== null}>
								<label class="flex items-center gap-2 text-sm text-muted-foreground">
									<input
										type="checkbox"
										checked={useWorktree()}
										onChange={(e) => {
										const value = e.currentTarget.checked;
										setUseWorktree(value);
										fetch(
											`/api/projects/${props.slug}/board/tickets/${props.ticket.folderName}/use-worktree`,
											{
												method: "PUT",
												headers: { "Content-Type": "application/json" },
												body: JSON.stringify({ useWorktree: value }),
											}
										).catch((err) => {
											console.warn("Failed to persist useWorktree:", err);
										});
									}}
										class="rounded border-input"
									/>
									Launch in worktree
								</label>
							</Show>

							<div class="flex flex-col gap-4 rounded-md border border-border p-4">
								<div>
									<label class="mb-1 block text-sm text-muted-foreground">Launch</label>
									<select
										value={selectedProfile()}
										onChange={(e) => { setSelectedProfile(e.currentTarget.value); props.onDefaultsChange({ profileName: e.currentTarget.value }); }}
										class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
									>
										<For each={cfg().profiles}>
											{(p) => <option value={p.name}>{p.name}</option>}
										</For>
									</select>
								</div>

								<div>
									<label class="mb-1 block text-sm text-muted-foreground">Prompt</label>
									<select
										value={selectedTemplate()}
										onChange={(e) => { setSelectedTemplate(e.currentTarget.value); props.onDefaultsChange({ templateName: e.currentTarget.value }); }}
										class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
									>
										<For each={cfg().templates}>
											{(t) => <option value={t.name}>{t.name}</option>}
										</For>
									</select>
								</div>

								<Show when={cfg().skills.length > 0}>
									<div>
										<label class="mb-1 block text-sm text-muted-foreground">Skills</label>
										<div class="flex flex-col gap-1">
											<For each={cfg().skills}>
												{(skill) => (
													<label class="flex items-center gap-2 text-sm">
														<input
															type="checkbox"
															checked={checkedSkills().has(skill.name)}
															onChange={() => toggleSkill(skill.name)}
															class="rounded border-input"
														/>
														{skill.name}
													</label>
												)}
											</For>
										</div>
									</div>
								</Show>

								<button
									onClick={launchAgent}
									disabled={launching()}
									class="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
								>
									Run
								</button>
							</div>
						</div>
					)}
			</Show>

			<ErrorDialog error={errorInfo()} onClose={() => setErrorInfo(null)} />

			<Show when={behindRemoteMsg()}>
				<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
					<div class="fixed inset-0" onClick={() => setBehindRemoteMsg("")} />
					<div class="relative z-10 w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-lg">
						<p class="mb-4 text-sm">{behindRemoteMsg()}</p>
						<div class="flex justify-end gap-2">
							<button
								onClick={() => setBehindRemoteMsg("")}
								class="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
							>
								Cancel
							</button>
							<button
								onClick={pullAndRetry}
								disabled={launching()}
								class="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
							>
								Pull & Retry
							</button>
						</div>
					</div>
				</div>
			</Show>
		</div>
	);
}
