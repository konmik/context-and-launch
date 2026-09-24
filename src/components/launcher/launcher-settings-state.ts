import { createSignal, createEffect, createMemo, useContext } from "solid-js";
import { revalidate, useAction } from "@solidjs/router";
import type {
  LauncherItemType,
  MergedLauncherConfig,
} from "~/core/launcher/launcher-config.js";
import { errorPayload, type ErrorInfo } from "~/core/shared/errors.js";
import {
  getProjectLauncherConfig, type ProjectLauncherConfigData,
} from "./launcher-api.js";
import {
	setProjectPath as setProjectPathAction,
	setTicketsLocation as setTicketsLocationAction,
} from "../project/project-api.js";
import { createListReorder, midpointOrder } from "../board/list-reorder.js";
import type {
  ItemType, Scope, ItemFormState,
} from "./launcher-settings-dialogs.js";
import { AppConfigContext } from '../config/app-config-storage.js';
import { LauncherConfigContext } from './shared-launcher-config-storage.js';
import {
  mergeLauncherConfigs, type LauncherConfig,
} from '~/core/launcher/launcher-config-data.js';
import { updateProjectLauncherConfig } from './project-launcher-config-storage.js';
import type { Updater } from '~/util/updater.js';

const collections = { template: 'templates', skill: 'skills', profile: 'profiles', shortcut: 'shortcuts' } as const;

export function createLauncherSettingsState(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projectSlug: string;
}) {
	const appConfig = useContext(AppConfigContext)!;
	const sharedConfig = useContext(LauncherConfigContext)!;
	const projectConfig = createMemo(() => props.open ? getProjectLauncherConfig(props.projectSlug) : null,
		{ loadingValue: null });
	const config = createMemo(() => {
		const project = projectConfig();
		return project && mergeLauncherConfigs(sharedConfig.get(), project.projectConfig);
	});
	const [loading, setLoading] = createSignal(false);
	const [error, setError] = createSignal<ErrorInfo | null>(null);
	const [form, setForm] = createSignal<ItemFormState | null>(null);
	const [projectName, setProjectName] = createSignal("");
	const [projectPath, setProjectPath] = createSignal("");
	const [savingProjectPath, setSavingProjectPath] = createSignal(false);
	const runSetProjectPath = useAction(setProjectPathAction);
	const [ticketsPath, setTicketsPath] = createSignal("");
	const [ticketsBranch, setTicketsBranch] = createSignal("");
	const [savingTicketsLocation, setSavingTicketsLocation] = createSignal(false);
	const runSetTicketsLocation = useAction(setTicketsLocationAction);
	const [worktreeRootPath, setWorktreeRootPath] = createSignal("");
	const [branchPrefix, setBranchPrefix] = createSignal<string | undefined>(undefined);
	const [conflictPrompt, setConflictPrompt] = createSignal("");
	const [activeTab, setActiveTab] = createSignal<string>("profiles");

	createEffect(() => props.open, (open) => {
		if (!open) return;
		setForm(null); setError(null);
		loadConfig();
	});

	function applyConfig(data: ProjectLauncherConfigData) {
		const merged = mergeLauncherConfigs(sharedConfig.get(), data.projectConfig);
		setProjectName(data.projectName ?? "");
		setProjectPath(data.projectPath);
		setTicketsPath(data.worktreeDir);
		setTicketsBranch(data.ticketsBranch ?? "");
		setWorktreeRootPath(merged.worktreeRootPath ?? "");
		setBranchPrefix(merged.branchPrefix);
		setConflictPrompt(merged.conflictResolutionPrompt);
	}

	async function loadConfig() {
		setLoading(true); setError(null);
		try {
			await revalidate('launcher-config');
			applyConfig(await getProjectLauncherConfig(props.projectSlug));
		} catch (error) { setError(errorPayload(error, 'Load failed')); }
		finally { setLoading(false); }
	}

	function startAdd(itemType: ItemType) {
		setForm({ mode: "add", itemType, scope: "app", name: "", text: "" });
	}
	function startEdit(
		itemType: ItemType, scope: Scope, name: string, text: string,
	) {
		setForm({ mode: "edit", itemType, scope, name, text, oldName: name });
	}

	async function submitForm(submittedForm?: ItemFormState) {
		const f = submittedForm ?? form();
		if (!f || !f.name.trim()) return;
		setError(null);
		try {
			const usesCommand = f.itemType === "profile" || f.itemType === "shortcut";
			const fields = usesCommand
				? { name: f.name, command: f.text }
				: { name: f.name, text: f.text };
			const result = await updateConfig(f.scope, current => {
				const key = collections[f.itemType];
				const items = current[key] ?? [];
				if (items.some(item => item.name === fields.name && (f.mode === 'add' || item.name !== f.oldName))) {
					throw new Error(`An item named "${fields.name}" already exists`);
				}
				if (f.mode === 'add') return { ...current, [key]: [...items, fields] };
				if (!items.some(item => item.name === f.oldName)) throw new Error(`Item "${f.oldName}" not found`);
				return {
					...current,
					[key]: items.map(item => item.name === f.oldName ? { ...item, ...fields } : item),
					columnDefaults: current.columnDefaults && Object.fromEntries(
						Object.entries(current.columnDefaults).map(([column, defaults]) => [column, {
							...defaults,
							templateName: f.itemType === 'template' && defaults.templateName === f.oldName
								? f.name : defaults.templateName,
							profileName: f.itemType === 'profile' && defaults.profileName === f.oldName
								? f.name : defaults.profileName,
							checkedSkills: f.itemType === 'skill'
								? defaults.checkedSkills.map(name => name === f.oldName ? f.name : name)
								: defaults.checkedSkills,
							skillOrder: f.itemType === 'skill'
								? defaults.skillOrder?.map(name => name === f.oldName ? f.name : name)
								: defaults.skillOrder,
						}]),
					),
				};
			});
			if (result.type === 'Failure') { setError({ title: 'Save failed', description: result.error }); return; }
			setForm(null);
		} catch (e) { setError(errorPayload(e, "Save failed")); }
	}

	async function deleteItemFn(itemType: ItemType, scope: Scope, name: string) {
		setError(null);
		try {
			const result = await updateConfig(scope, current => ({
				...current,
				[collections[itemType]]: (current[collections[itemType]] ?? []).filter(item => item.name !== name),
				columnDefaults: current.columnDefaults && Object.fromEntries(
					Object.entries(current.columnDefaults).map(([column, defaults]) => [column, {
						...defaults,
						templateName: itemType === 'template' && defaults.templateName === name
							? null : defaults.templateName,
						profileName: itemType === 'profile' && defaults.profileName === name
							? null : defaults.profileName,
						checkedSkills: itemType === 'skill'
							? defaults.checkedSkills.filter(value => value !== name) : defaults.checkedSkills,
						skillOrder: itemType === 'skill'
							? defaults.skillOrder?.filter(value => value !== name) : defaults.skillOrder,
					}]),
				),
			}));
			if (result.type === 'Failure') setError({ title: 'Delete failed', description: result.error });
		} catch (e) { setError(errorPayload(e, "Delete failed")); }
	}

	async function saveProjectNameFn() {
		setError(null);
		try {
			const name = projectName().trim() || undefined;
			const result = await appConfig.update(current => ({
				...current,
				projects: current.projects.map(project => project.projectSlug === props.projectSlug
					? { ...project, name } : project),
			}));
			if (result.type === 'Failure') setError({ title: "Save failed", description: result.error });
		} catch (e) { setError(errorPayload(e, "Save failed")); }
	}

	async function saveWorktreeRootPathFn(path = worktreeRootPath()) {
		setError(null);
		try {
			const result = await updateConfig('project', current => ({
				...current, worktreeRootPath: path.trim() || undefined,
			}));
			if (result.type === 'Failure') setError({ title: 'Save failed', description: result.error });
		} catch (e) { setError(errorPayload(e, "Save failed")); }
	}

	async function saveProjectPathFn(path = projectPath()) {
		if (savingProjectPath() || path.trim() === projectConfig()?.projectPath) return;
		setSavingProjectPath(true);
		setError(null);
		try {
			const result = await runSetProjectPath(props.projectSlug, path);
			if (!result.ok) { setError({ title: "Save failed", description: result.message }); return; }
			setProjectPath(result.path);
			await revalidate(["launcher-config", "project-page", "project-sync-status"]);
		} catch (e) { setError(errorPayload(e, "Save failed")); }
		finally { setSavingProjectPath(false); }
	}

	async function saveBranchPrefixFn() {
		setError(null);
		try {
			const value = branchPrefix()?.trim() || undefined;
			const result = await updateConfig('project', current => ({ ...current, branchPrefix: value }));
			if (result.type === 'Failure') setError({ title: 'Save failed', description: result.error });
		} catch (e) { setError(errorPayload(e, "Save failed")); }
	}

	async function saveTicketsLocation(kind: "path" | "branch", value: string) {
		const saved = projectConfig();
		if (value.trim() === (kind === "path" ? saved?.worktreeDir : saved?.ticketsBranch ?? '')) return;
		if (savingTicketsLocation()) return;
		setSavingTicketsLocation(true);
		setError(null);
		try {
			const result = await runSetTicketsLocation(props.projectSlug, { kind, value });
			if (!result.ok) { setError({ title: "Save failed", description: result.message }); return; }
			if (kind === "path") {
				setTicketsPath(result.value);
			} else {
				setTicketsBranch(result.value);
			}
			await revalidate("launcher-config");
		} catch (e) { setError(errorPayload(e, "Save failed")); }
		finally { setSavingTicketsLocation(false); }
	}

	async function saveConflictResolutionFn() {
		setError(null);
		try {
			const value = conflictPrompt().trim() || undefined;
			const result = await updateConfig('project', current => ({ ...current, conflictResolutionPrompt: value }));
			if (result.type === 'Failure') setError({ title: 'Save failed', description: result.error });
		} catch (e) { setError(errorPayload(e, "Save failed")); }
	}

	type OrderedConfigKey = "templates" | "skills" | "profiles" | "shortcuts";
	type ItemFor<K extends OrderedConfigKey> = MergedLauncherConfig[K][number];

	function createItemReorder<K extends OrderedConfigKey>(
		itemType: LauncherItemType,
		collection: K,
	) {
		return createListReorder<ItemFor<K>>({
			items: () => config()?.[collection] ?? [],
			idOf: (item) => item.name,
			onReorder: (orderedNames, dragged) => {
				const cfg = config(); if (!cfg) return;
				const items = cfg[collection];
				const orderOf = (name: string) =>
					items.find(item => item.name === name)?.order;
				const newIndex = orderedNames.indexOf(dragged.name);
				const before = newIndex > 0
					? orderOf(orderedNames[newIndex - 1]) : undefined;
				const after = newIndex < orderedNames.length - 1
					? orderOf(orderedNames[newIndex + 1]) : undefined;
				const newOrder = midpointOrder(before, after);
				saveItemOrderFn(itemType, dragged.scope, dragged.name, newOrder);
			},
		});
	}

	const templateReorder = createItemReorder("template", "templates");
	const skillReorder = createItemReorder("skill", "skills");
	const profileReorder = createItemReorder("profile", "profiles");
	const shortcutReorder = createItemReorder("shortcut", "shortcuts");

	async function saveItemOrderFn(
		itemType: LauncherItemType,
		scope: Scope,
		name: string,
		order: number,
	) {
		setError(null);
		try {
			const result = await updateConfig(scope, current => ({
				...current,
				[collections[itemType]]: (current[collections[itemType]] ?? [])
					.map(item => item.name === name ? { ...item, order } : item),
			}));
			if (result.type === 'Failure') setError({ title: 'Reorder failed', description: result.error });
		} catch (e) { setError(errorPayload(e, "Reorder failed")); }
	}

	async function updateConfig(scope: Scope, transform: Updater<LauncherConfig>) {
		if (scope === 'app') return sharedConfig.update(transform);
		const projectSlug = props.projectSlug;
		return updateProjectLauncherConfig(projectSlug, transform);
	}

	return {
		config, loading, error, setError, form, setForm,
		projectName, setProjectName, worktreeRootPath, setWorktreeRootPath,
		projectPath, setProjectPath, savingProjectPath, saveProjectPath: saveProjectPathFn,
		ticketsPath, setTicketsPath, ticketsBranch, setTicketsBranch, savingTicketsLocation,
		saveTicketsPath: (path = ticketsPath()) => saveTicketsLocation("path", path),
		saveTicketsBranch: () => saveTicketsLocation("branch", ticketsBranch()),
		branchPrefix, setBranchPrefix, conflictPrompt, setConflictPrompt, activeTab, setActiveTab,
		startAdd, startEdit, submitForm, deleteItem: deleteItemFn,
		saveProjectName: saveProjectNameFn, saveWorktreeRootPath: saveWorktreeRootPathFn,
		saveBranchPrefix: saveBranchPrefixFn, saveConflictResolution: saveConflictResolutionFn,
		templateReorder, skillReorder, profileReorder, shortcutReorder,
	};
}

export type LauncherSettingsController = ReturnType<typeof createLauncherSettingsState>;
