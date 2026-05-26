import { createSignal, createEffect, on, Show, For } from "solid-js";
import { DialogRoot, DialogTitle, DialogCloseTrigger } from "./ui/dialog";
import { TabsRoot, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import type { MergedLauncherConfig } from "~/types.js";
import { useModEnterSubmit, modEnterHint } from "~/lib/use-mod-enter-submit";

interface LauncherSettingsProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	slug: string;
}

type ItemType = "template" | "skill" | "profile" | "shortcut";
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
	const [conflictPrompt, setConflictPrompt] = createSignal("");
	const [activeTab, setActiveTab] = createSignal<string>("general");

	const segments: Record<ItemType, string> = { template: "templates", skill: "skills", profile: "profiles", shortcut: "shortcuts" };

	function itemEndpoint(itemType: ItemType, scope: Scope): string {
		const base = scope === "app" ? "/api/launcher-config" : `/api/projects/${props.slug}/launcher-config`;
		return `${base}/${segments[itemType]}`;
	}

	createEffect(on(() => props.open, (open) => { if (open) { loadConfig(); setForm(null); } }));

	async function loadConfig() {
		setLoading(true);
		setError("");
		try {
			const res = await fetch(`/api/projects/${props.slug}/launcher-config`);
			if (res.ok) {
				const data = await res.json();
				setConfig(data);
				setWorktreeRootPath(data.worktreeRootPath ?? "");
				setConflictPrompt(data.conflictResolutionPrompt ?? "");
			} else setError(await res.text() || "Failed to load config");
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load config");
		} finally { setLoading(false); }
	}

	function startAdd(itemType: ItemType) { setForm({ mode: "add", itemType, scope: "app", name: "", text: "" }); }

	function startEdit(itemType: ItemType, scope: Scope, name: string, text: string) {
		setForm({ mode: "edit", itemType, scope, name, text, oldName: name });
	}

	async function submitForm() {
		const f = form();
		if (!f || !f.name.trim()) return;
		setError("");
		const endpoint = itemEndpoint(f.itemType, f.scope);
		const usesCommand = f.itemType === "profile" || f.itemType === "shortcut";
		try {
			const payload = usesCommand
				? (f.mode === "add" ? { name: f.name, command: f.text } : { oldName: f.oldName, name: f.name, command: f.text })
				: (f.mode === "add" ? { name: f.name, text: f.text } : { oldName: f.oldName, name: f.name, text: f.text });
			const res = await fetch(endpoint, {
				method: f.mode === "add" ? "POST" : "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});
			if (!res.ok) { setError(await res.text() || "Failed to save"); return; }
			setForm(null);
			await loadConfig();
		} catch (e) { setError(e instanceof Error ? e.message : "Failed to save"); }
	}

	async function deleteItem(itemType: ItemType, scope: Scope, name: string) {
		setError("");
		try {
			const res = await fetch(itemEndpoint(itemType, scope), { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
			if (!res.ok) { setError(await res.text() || "Failed to delete"); return; }
			await loadConfig();
		} catch (e) { setError(e instanceof Error ? e.message : "Failed to delete"); }
	}

	async function saveWorktreeRootPath() {
		setError("");
		try {
			const res = await fetch(`/api/projects/${props.slug}/launcher-config/worktree-root-path`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ worktreeRootPath: worktreeRootPath() }) });
			if (!res.ok) { setError(await res.text() || "Failed to save"); return; }
			await loadConfig();
		} catch (e) { setError(e instanceof Error ? e.message : "Failed to save"); }
	}

	async function saveConflictResolution() {
		setError("");
		try {
			const res = await fetch(`/api/projects/${props.slug}/launcher-config/conflict-resolution`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conflictResolutionPrompt: conflictPrompt() }) });
			if (!res.ok) { setError(await res.text() || "Failed to save"); return; }
			await loadConfig();
		} catch (e) { setError(e instanceof Error ? e.message : "Failed to save"); }
	}

	useModEnterSubmit({ onSubmit: submitForm, disabled: () => !form()?.name.trim(), active: () => !!form() });

	function ScopeBadge(p: { scope: string }) {
		return <span class={`rounded px-1.5 py-0.5 text-xs ${p.scope === "app" ? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" : "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"}`}>{p.scope === "app" ? "User" : "Project"}</span>;
	}

	function ItemRow(p: { itemType: ItemType; scope: Scope; name: string; detail: string }) {
		return (
			<div class="flex items-center justify-between rounded-md border border-border px-3 py-2">
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-2">
						<span class="text-sm font-medium">{p.name}</span>
						<ScopeBadge scope={p.scope} />
					</div>
					<p class="mt-1 truncate text-xs text-muted-foreground">{p.detail}</p>
				</div>
				<div class="ml-2 flex shrink-0 gap-1">
					<button onClick={() => startEdit(p.itemType, p.scope, p.name, p.detail)} class="btn-secondary btn-sm">Edit</button>
					<button onClick={() => deleteItem(p.itemType, p.scope, p.name)} class="btn-secondary btn-sm text-destructive hover:bg-destructive hover:text-destructive-foreground">Delete</button>
				</div>
			</div>
		);
	}

	return (<>
		<DialogRoot open={props.open} onOpenChange={() => props.onOpenChange(false)} class="flex h-[80vh] max-w-3xl flex-col p-0">
						<div class="flex items-center justify-between px-6 py-4">
							<DialogTitle class="mb-0">Settings</DialogTitle>
							<div class="flex items-center gap-1">
								<button onClick={() => fetch("/api/open-config-dir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "app" }) })} class="px-2 py-1 text-xs text-muted-foreground hover:text-foreground" title="Open user config directory">User&#8599;</button>
								<button onClick={() => fetch("/api/open-config-dir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "project", slug: props.slug }) })} class="px-2 py-1 text-xs text-muted-foreground hover:text-foreground" title="Open project config directory">Project&#8599;</button>
								<button onClick={() => fetch("/api/open-config-dir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "worktree", slug: props.slug }) })} class="px-2 py-1 text-xs text-muted-foreground hover:text-foreground" title="Open worktrees directory">Worktrees&#8599;</button>
								<DialogCloseTrigger>
									<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
								</DialogCloseTrigger>
							</div>
						</div>

						<TabsRoot value={activeTab()} onValueChange={(d) => setActiveTab(d.value)}>
							<div class="px-6">
								<TabsList>
									<TabsTrigger value="general">General</TabsTrigger>
									<TabsTrigger value="templates">Prompts</TabsTrigger>
									<TabsTrigger value="skills">Skills</TabsTrigger>
									<TabsTrigger value="profiles">Launch</TabsTrigger>
								</TabsList>
							</div>

							<div class="flex-1 overflow-auto px-6 py-4">
								<Show when={error()}><div class="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error()}</div></Show>
								<Show when={loading()}><p class="text-sm text-muted-foreground">Loading...</p></Show>

								<Show when={!loading() && config()}>
									{(cfg) => (<>
										<TabsContent value="general">
											<div class="space-y-6">
												<section>
													<h3 class="mb-2 text-sm font-semibold">Agent worktree root path <ScopeBadge scope="project" /></h3>
													<div class="flex gap-2">
														<input type="text" value={worktreeRootPath()} onInput={(e) => setWorktreeRootPath(e.currentTarget.value)} onBlur={saveWorktreeRootPath} onKeyDown={(e) => { if (e.key === "Enter") saveWorktreeRootPath(); }} class="input input-sm flex-1" placeholder="e.g. ~/.ai-stages/worktrees" />
														<button type="button" onClick={async () => { try { const res = await fetch("/api/pick-directory"); if (!res.ok) return; const { path } = await res.json(); setWorktreeRootPath(path); await saveWorktreeRootPath(); } catch (e) { setError(e instanceof Error ? e.message : "Failed to pick directory"); } }} class="btn-secondary">Browse</button>
													</div>
												</section>
												<section>
													<h3 class="mb-2 text-sm font-semibold">Conflict resolution prompt <ScopeBadge scope="project" /></h3>
													<textarea value={conflictPrompt()} onInput={(e) => setConflictPrompt(e.currentTarget.value)} onBlur={saveConflictResolution} class="input min-h-[80px]" style={{ height: "auto" }} placeholder="Prompt for resolving merge conflicts..." data-testid="conflict-prompt" />
												</section>
											</div>
										</TabsContent>

										<TabsContent value="templates">
											<div class="space-y-6">
												<section>
													<div class="mb-2 flex items-center justify-between">
														<h3 class="text-sm font-semibold">Prompts</h3>
														<button onClick={() => startAdd("template")} class="btn-primary btn-sm">Add</button>
													</div>
													<Show when={cfg().templates.length > 0} fallback={<p class="py-3 text-center text-sm text-muted-foreground">No prompts configured.</p>}>
														<div class="space-y-2">
															<For each={cfg().templates}>{(item) => <ItemRow itemType="template" scope={item.scope} name={item.name} detail={item.text} />}</For>
														</div>
													</Show>
												</section>
											</div>
										</TabsContent>

										<TabsContent value="skills">
											<div class="space-y-6">
												<section>
													<div class="mb-2 flex items-center justify-between">
														<h3 class="text-sm font-semibold">Skills</h3>
														<button onClick={() => startAdd("skill")} class="btn-primary btn-sm">Add</button>
													</div>
													<Show when={cfg().skills.length > 0} fallback={<p class="py-3 text-center text-sm text-muted-foreground">No skills configured.</p>}>
														<div class="space-y-2">
															<For each={cfg().skills}>{(item) => <ItemRow itemType="skill" scope={item.scope} name={item.name} detail={item.text} />}</For>
														</div>
													</Show>
												</section>
											</div>
										</TabsContent>

										<TabsContent value="profiles">
											<div class="space-y-6">
												<section>
													<div class="mb-2 flex items-center justify-between">
														<h3 class="text-sm font-semibold">Profiles</h3>
														<button onClick={() => startAdd("profile")} class="btn-primary btn-sm">Add</button>
													</div>
													<Show when={cfg().profiles.length > 0} fallback={<p class="py-3 text-center text-sm text-muted-foreground">No profiles configured.</p>}>
														<div class="space-y-2">
															<For each={cfg().profiles}>{(item) => <ItemRow itemType="profile" scope={item.scope} name={item.name} detail={item.command} />}</For>
														</div>
													</Show>
												</section>
												<section>
													<div class="mb-2 flex items-center justify-between">
														<h3 class="text-sm font-semibold">Shortcuts</h3>
														<button onClick={() => startAdd("shortcut")} class="btn-primary btn-sm">Add</button>
													</div>
													<Show when={cfg().shortcuts.length > 0} fallback={<p class="py-3 text-center text-sm text-muted-foreground">No shortcuts configured.</p>}>
														<div class="space-y-2">
															<For each={cfg().shortcuts}>{(item) => <ItemRow itemType="shortcut" scope={item.scope} name={item.name} detail={item.command} />}</For>
														</div>
													</Show>
												</section>
											</div>
										</TabsContent>
									</>)}
								</Show>
							</div>
						</TabsRoot>
		</DialogRoot>

		<DialogRoot open={!!form()} onOpenChange={() => setForm(null)} class="max-w-lg p-0">
						<Show when={form()}>
							{(f) => (<>
								<div class="flex items-center justify-between border-b border-border px-6 py-4">
									<DialogTitle class="mb-0">
										{f().mode === "add" ? "Add" : "Edit"} {f().itemType === "template" ? "Prompt" : f().itemType === "skill" ? "Skill" : f().itemType === "profile" ? "Launch" : "Shortcut"}
									</DialogTitle>
									<DialogCloseTrigger>
										<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
									</DialogCloseTrigger>
								</div>
								<div class="space-y-3 px-6 py-4">
									<div>
										<label class="mb-1 block text-sm text-muted-foreground">Name</label>
										<input type="text" value={f().name} onInput={(e) => setForm({ ...f(), name: e.currentTarget.value })} class="input input-sm" placeholder={f().itemType === "profile" ? "Launch name" : f().itemType === "skill" ? "Skill name" : f().itemType === "shortcut" ? "Shortcut name" : "Prompt name"} />
									</div>
									<div>
										<label class="mb-1 block text-sm text-muted-foreground">{f().itemType === "shortcut" || f().itemType === "profile" ? "Command" : "Prompt"}</label>
										<textarea value={f().text} onInput={(e) => setForm({ ...f(), text: e.currentTarget.value })} class="input min-h-[120px]" style={{ height: "auto" }} placeholder={f().itemType === "profile" ? "e.g. powershell -File run-agent.ps1" : f().itemType === "shortcut" ? "e.g. code {{projectPath}}" : "Prompt text with {{placeholders}}"} />
										<p class="mt-1 text-xs text-muted-foreground">
											{f().itemType === "profile" ? "{{initialPrompt}} {{windowTitle}} {{appConfigDir}}" : f().itemType === "shortcut" ? "{{ticketDir}} {{ticketSlug}} {{ticketTitle}} {{ticketNumber}} {{ticketStatus}} {{projectPath}} {{projectSlug}} {{launchDir}}" : "{{ticketDir}} {{ticketSlug}} {{ticketTitle}} {{ticketNumber}} {{ticketStatus}} {{projectPath}} {{projectSlug}}"}
										</p>
									</div>
									<Show when={f().mode === "add"}>
										<div>
											<label class="mb-1 block text-sm text-muted-foreground">Scope</label>
											<div class="flex gap-4">
												<label class="flex items-center gap-1.5 text-sm"><input type="radio" name="scope" checked={f().scope === "app"} onChange={() => setForm({ ...f(), scope: "app" })} /> User</label>
												<label class="flex items-center gap-1.5 text-sm"><input type="radio" name="scope" checked={f().scope === "project"} onChange={() => setForm({ ...f(), scope: "project" })} /> Project</label>
											</div>
										</div>
									</Show>
								</div>
								<div class="flex justify-end gap-2 border-t border-border px-6 py-3">
									<button onClick={() => setForm(null)} class="btn-secondary">Cancel</button>
									<button onClick={submitForm} disabled={!f().name.trim()} title={modEnterHint()} class="btn-primary">{f().mode === "add" ? "Add" : "Save"}</button>
								</div>
							</>)}
						</Show>
		</DialogRoot>
	</>);
}
