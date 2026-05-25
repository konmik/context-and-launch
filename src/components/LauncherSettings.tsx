import { createSignal, createEffect, on, Show, For } from "solid-js";
import type { MergedLauncherConfig } from "~/types.js";
import { useModEnterSubmit, modEnterHint } from "~/lib/use-mod-enter-submit";

interface LauncherSettingsProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	slug: string;
}

type ItemType = "template" | "skill" | "profile";
type Scope = "app" | "project";

interface ItemFormState {
	mode: "add" | "edit";
	itemType: ItemType;
	scope: Scope;
	name: string;
	text: string;
	oldName?: string;
}

export default function LauncherSettings(props: LauncherSettingsProps) {
	const [config, setConfig] = createSignal<MergedLauncherConfig | null>(null);
	const [loading, setLoading] = createSignal(false);
	const [error, setError] = createSignal("");
	const [form, setForm] = createSignal<ItemFormState | null>(null);
	const [worktreeRootPath, setWorktreeRootPath] = createSignal("");
	const [activeTab, setActiveTab] = createSignal<"general" | "templates" | "skills" | "profiles">("general");

	function itemEndpoint(itemType: ItemType, scope: Scope): string {
		const base = scope === "app"
			? "/api/launcher-config"
			: `/api/projects/${props.slug}/launcher-config`;
		const segment = itemType === "template" ? "templates" : itemType === "skill" ? "skills" : "profiles";
		return `${base}/${segment}`;
	}

	createEffect(
		on(
			() => props.open,
			(open) => {
				if (open) {
					loadConfig();
					setForm(null);
				}
			}
		)
	);

	async function loadConfig() {
		setLoading(true);
		setError("");
		try {
			const res = await fetch(`/api/projects/${props.slug}/launcher-config`);
			if (res.ok) {
				const data = await res.json();
				setConfig(data);
				setWorktreeRootPath(data.worktreeRootPath ?? "");
			} else {
				setError(await res.text() || "Failed to load config");
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load config");
		} finally {
			setLoading(false);
		}
	}

	function startAdd(itemType: ItemType) {
		setForm({
			mode: "add",
			itemType,
			scope: "app",
			name: "",
			text: "",
		});
	}

	function startEdit(itemType: ItemType, scope: Scope, name: string, text: string) {
		setForm({
			mode: "edit",
			itemType,
			scope,
			name,
			text,
			oldName: name,
		});
	}

	async function submitForm() {
		const f = form();
		if (!f || !f.name.trim()) return;
		setError("");

		const endpoint = itemEndpoint(f.itemType, f.scope);
		const isProfile = f.itemType === "profile";

		try {
			if (f.mode === "add") {
				const payload = isProfile
					? { name: f.name, command: f.text }
					: { name: f.name, text: f.text };
				const res = await fetch(endpoint, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});
				if (!res.ok) {
					setError(await res.text() || "Failed to add");
					return;
				}
			} else {
				const payload = isProfile
					? { oldName: f.oldName, name: f.name, command: f.text }
					: { oldName: f.oldName, name: f.name, text: f.text };
				const res = await fetch(endpoint, {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});
				if (!res.ok) {
					setError(await res.text() || "Failed to update");
					return;
				}
			}
			setForm(null);
			await loadConfig();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to save");
		}
	}

	async function deleteItem(itemType: ItemType, scope: Scope, name: string) {
		setError("");
		const endpoint = itemEndpoint(itemType, scope);

		try {
			const res = await fetch(endpoint, {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name }),
			});
			if (!res.ok) {
				setError(await res.text() || "Failed to delete");
				return;
			}
			await loadConfig();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to delete");
		}
	}

	async function saveWorktreeRootPath() {
		setError("");
		try {
			const res = await fetch(`/api/projects/${props.slug}/launcher-config/worktree-root-path`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ worktreeRootPath: worktreeRootPath() }),
			});
			if (!res.ok) {
				setError(await res.text() || "Failed to save");
				return;
			}
			await loadConfig();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to save");
		}
	}

	useModEnterSubmit({
		onSubmit: submitForm,
		disabled: () => !form()?.name.trim(),
		active: () => !!form(),
	});

	return (<>
		<Show when={props.open}>
			<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
				<div class="fixed inset-0" onClick={() => props.onOpenChange(false)} />
				<div class="relative z-10 flex h-[80vh] w-full max-w-2xl flex-col rounded-lg border border-border bg-card shadow-lg">
					<div class="flex items-center justify-between border-b border-border px-6 py-4">
						<h2 class="text-lg font-semibold">Settings</h2>
						<button
							onClick={() => props.onOpenChange(false)}
							class="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
						>
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
						</button>
					</div>

					<div class="flex items-center border-b border-border px-6">
						<div class="flex gap-2">
							<button
								onClick={() => setActiveTab("general")}
								class={`px-3 py-2 text-sm font-medium ${activeTab() === "general" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
							>
								General
							</button>
							<button
								onClick={() => setActiveTab("templates")}
								class={`px-3 py-2 text-sm font-medium ${activeTab() === "templates" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
							>
								Prompts
							</button>
							<button
								onClick={() => setActiveTab("skills")}
								class={`px-3 py-2 text-sm font-medium ${activeTab() === "skills" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
							>
								Skills
							</button>
							<button
								onClick={() => setActiveTab("profiles")}
								class={`px-3 py-2 text-sm font-medium ${activeTab() === "profiles" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
							>
								Launch
							</button>
						</div>
						<div class="ml-auto flex gap-1">
							<button
								onClick={() => fetch("/api/open-config-dir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "app" }) })}
								class="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
								title="Open user config directory"
							>
								User&#8599;
							</button>
							<button
								onClick={() => fetch("/api/open-config-dir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "project", slug: props.slug }) })}
								class="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
								title="Open project config directory"
							>
								Project&#8599;
							</button>
							<button
								onClick={() => fetch("/api/open-config-dir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "worktree", slug: props.slug }) })}
								class="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
								title="Open worktrees directory"
						>
							Worktrees&#8599;
						</button>
						</div>
					</div>

					<div class="flex-1 overflow-auto px-6 py-4">
						<Show when={error()}>
							<div class="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
								{error()}
							</div>
						</Show>

						<Show when={loading()}>
							<p class="text-sm text-muted-foreground">Loading...</p>
						</Show>

						<Show when={!loading() && config()}>
							{(cfg) => (
									<>
									<Show when={activeTab() === "general"}>
									<div class="space-y-6">
										<section>
											<h3 class="mb-2 text-sm font-semibold">
									Agent worktree root path
									<span class="ml-2 rounded px-1.5 py-0.5 text-xs bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">Project</span>
								</h3>
											<div class="flex gap-2">
												<input
													type="text"
													value={worktreeRootPath()}
													onInput={(e) => setWorktreeRootPath(e.currentTarget.value)}
													onBlur={saveWorktreeRootPath}
													onKeyDown={(e) => { if (e.key === "Enter") saveWorktreeRootPath(); }}
													class="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
													placeholder="e.g. ~/.ai-stages/worktrees"
												/>
												<button
													type="button"
													onClick={async () => {
														try {
															const res = await fetch("/api/pick-directory");
															if (!res.ok) return;
															const { path } = await res.json();
															setWorktreeRootPath(path);
															await saveWorktreeRootPath();
														} catch (e) {
															setError(e instanceof Error ? e.message : "Failed to pick directory");
														}
													}}
													class="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
												>
													Browse
												</button>
											</div>
										</section>
									</div>
									</Show>

									<Show when={activeTab() === "templates"}>
									<div class="space-y-6">
										<section>
											<div class="mb-2 flex items-center justify-between">
												<h3 class="text-sm font-semibold">Prompts</h3>
												<button
													onClick={() => startAdd("template")}
													class="inline-flex h-7 items-center justify-center rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
												>
													Add
												</button>
											</div>
											<Show when={cfg().templates.length > 0} fallback={<p class="py-3 text-center text-sm text-muted-foreground">No prompts configured.</p>}>
												<div class="space-y-2">
													<For each={cfg().templates}>
														{(item) => (
															<div class="flex items-center justify-between rounded-md border border-border px-3 py-2">
																<div class="min-w-0 flex-1">
																	<div class="flex items-center gap-2">
																		<span class="text-sm font-medium">{item.name}</span>
																		<span class={`rounded px-1.5 py-0.5 text-xs ${item.scope === "app" ? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" : "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"}`}>
																			{item.scope === "app" ? "User" : "Project"}
																		</span>
																	</div>
																	<p class="mt-1 truncate text-xs text-muted-foreground">{item.text}</p>
																</div>
																<div class="ml-2 flex shrink-0 gap-1">
																	<button
																		onClick={() => startEdit("template", item.scope, item.name, item.text)}
																		class="inline-flex h-7 items-center justify-center rounded-md border border-input bg-background px-2 text-xs hover:bg-accent hover:text-accent-foreground"
																	>
																		Edit
																	</button>
																	<button
																		onClick={() => deleteItem("template", item.scope, item.name)}
																		class="inline-flex h-7 items-center justify-center rounded-md border border-input bg-background px-2 text-xs text-destructive hover:bg-destructive hover:text-destructive-foreground"
																	>
																		Delete
																	</button>
																</div>
															</div>
														)}
													</For>
												</div>
											</Show>
										</section>
									</div>
									</Show>

									<Show when={activeTab() === "skills"}>
									<div class="space-y-6">
										<section>
											<div class="mb-2 flex items-center justify-between">
												<h3 class="text-sm font-semibold">Skills</h3>
												<button
													onClick={() => startAdd("skill")}
													class="inline-flex h-7 items-center justify-center rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
												>
													Add
												</button>
											</div>
											<Show when={cfg().skills.length > 0} fallback={<p class="py-3 text-center text-sm text-muted-foreground">No skills configured.</p>}>
												<div class="space-y-2">
													<For each={cfg().skills}>
														{(item) => (
															<div class="flex items-center justify-between rounded-md border border-border px-3 py-2">
																<div class="min-w-0 flex-1">
																	<div class="flex items-center gap-2">
																		<span class="text-sm font-medium">{item.name}</span>
																		<span class={`rounded px-1.5 py-0.5 text-xs ${item.scope === "app" ? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" : "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"}`}>
																			{item.scope === "app" ? "User" : "Project"}
																		</span>
																	</div>
																	<p class="mt-1 truncate text-xs text-muted-foreground">{item.text}</p>
																</div>
																<div class="ml-2 flex shrink-0 gap-1">
																	<button
																		onClick={() => startEdit("skill", item.scope, item.name, item.text)}
																		class="inline-flex h-7 items-center justify-center rounded-md border border-input bg-background px-2 text-xs hover:bg-accent hover:text-accent-foreground"
																	>
																		Edit
																	</button>
																	<button
																		onClick={() => deleteItem("skill", item.scope, item.name)}
																		class="inline-flex h-7 items-center justify-center rounded-md border border-input bg-background px-2 text-xs text-destructive hover:bg-destructive hover:text-destructive-foreground"
																	>
																		Delete
																	</button>
																</div>
															</div>
														)}
													</For>
												</div>
											</Show>
										</section>
									</div>
									</Show>

									<Show when={activeTab() === "profiles"}>
									<div class="space-y-6">
										<section>
											<div class="mb-2 flex items-center justify-between">
												<h3 class="text-sm font-semibold">Launch</h3>
												<button
													onClick={() => startAdd("profile")}
													class="inline-flex h-7 items-center justify-center rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
												>
													Add
												</button>
											</div>
											<Show when={cfg().profiles.length > 0} fallback={<p class="py-3 text-center text-sm text-muted-foreground">No profiles configured.</p>}>
												<div class="space-y-2">
													<For each={cfg().profiles}>
														{(item) => (
															<div class="flex items-center justify-between rounded-md border border-border px-3 py-2">
																<div class="min-w-0 flex-1">
																	<div class="flex items-center gap-2">
																		<span class="text-sm font-medium">{item.name}</span>
																		<span class={`rounded px-1.5 py-0.5 text-xs ${item.scope === "app" ? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" : "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"}`}>
																			{item.scope === "app" ? "User" : "Project"}
																		</span>
																	</div>
																	<p class="mt-1 truncate text-xs text-muted-foreground">{item.command}</p>
																</div>
																<div class="ml-2 flex shrink-0 gap-1">
																	<button
																		onClick={() => startEdit("profile", item.scope, item.name, item.command)}
																		class="inline-flex h-7 items-center justify-center rounded-md border border-input bg-background px-2 text-xs hover:bg-accent hover:text-accent-foreground"
																	>
																		Edit
																	</button>
																	<button
																		onClick={() => deleteItem("profile", item.scope, item.name)}
																		class="inline-flex h-7 items-center justify-center rounded-md border border-input bg-background px-2 text-xs text-destructive hover:bg-destructive hover:text-destructive-foreground"
																	>
																		Delete
																	</button>
																</div>
															</div>
														)}
													</For>
												</div>
											</Show>
										</section>
									</div>
									</Show>
									</>
								)}
						</Show>

					</div>

				</div>
			</div>
		</Show>

		<Show when={form()}>
			{(f) => (
				<div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
					<div class="fixed inset-0" onClick={() => setForm(null)} />
					<div class="relative z-10 w-full max-w-lg rounded-lg border border-border bg-card shadow-lg">
						<div class="flex items-center justify-between border-b border-border px-6 py-4">
							<h2 class="text-lg font-semibold">
								{f().mode === "add" ? "Add" : "Edit"} {f().itemType === "template" ? "Prompt" : f().itemType === "skill" ? "Skill" : "Launch"}
							</h2>
							<button
								onClick={() => setForm(null)}
								class="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
							>
								<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
							</button>
						</div>
						<div class="space-y-3 px-6 py-4">
							<div>
								<label class="mb-1 block text-sm text-muted-foreground">Name</label>
								<input
									type="text"
									value={f().name}
									onInput={(e) => setForm({ ...f(), name: e.currentTarget.value })}
									class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
									placeholder={f().itemType === "profile" ? "Launch name" : f().itemType === "skill" ? "Skill name" : "Prompt name"}
								/>
							</div>
							<div>
								<label class="mb-1 block text-sm text-muted-foreground">
									Prompt
								</label>
								<textarea
									value={f().text}
									onInput={(e) => setForm({ ...f(), text: e.currentTarget.value })}
									class="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
									placeholder={f().itemType === "profile" ? "e.g. powershell -File run-agent.ps1" : "Prompt text with {{placeholders}}"}
								/>
								<p class="mt-1 text-xs text-muted-foreground">
									{f().itemType === "profile"
										? "{{initialPrompt}} {{windowTitle}} {{appConfigDir}}"
										: "{{ticketDir}} {{ticketSlug}} {{ticketTitle}} {{ticketNumber}} {{ticketStatus}} {{projectPath}} {{projectSlug}}"}
								</p>
							</div>
							<Show when={f().mode === "add"}>
								<div>
									<label class="mb-1 block text-sm text-muted-foreground">Scope</label>
									<div class="flex gap-4">
										<label class="flex items-center gap-1.5 text-sm">
											<input
												type="radio"
												name="scope"
												checked={f().scope === "app"}
												onChange={() => setForm({ ...f(), scope: "app" })}
											/>
											User
										</label>
										<label class="flex items-center gap-1.5 text-sm">
											<input
												type="radio"
												name="scope"
												checked={f().scope === "project"}
												onChange={() => setForm({ ...f(), scope: "project" })}
											/>
											Project
										</label>
									</div>
								</div>
							</Show>
						</div>
						<div class="flex justify-end gap-2 border-t border-border px-6 py-3">
							<button
								onClick={() => setForm(null)}
								class="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
							>
								Cancel
							</button>
							<button
								onClick={submitForm}
								disabled={!f().name.trim()}
								title={modEnterHint()}
								class="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
							>
								{f().mode === "add" ? "Add" : "Save"}
							</button>
						</div>
					</div>
				</div>
			)}
		</Show>
	</>);
}
