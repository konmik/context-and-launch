import * as v from 'valibot';
import type { JsonValue } from '../shared/json.js';

export interface OrderedLauncherItem { name: string; order?: number }
export type LauncherItemType = 'template' | 'skill' | 'profile' | 'shortcut';
export interface LauncherTemplate extends OrderedLauncherItem { text: string }
export interface LauncherSkill extends OrderedLauncherItem { text: string }
export interface LauncherProfile extends OrderedLauncherItem { command: string }
export interface LauncherShortcut extends OrderedLauncherItem { command: string }
export interface LauncherColumnDefaults {
	templateName: string | null;
	checkedSkills: string[];
	profileName: string | null;
	lastLayer?: 'editor' | 'launcher' | 'shortcuts';
	skillOrder?: string[];
	editedPrompt?: string;
}
export interface LauncherConfig {
	templates: LauncherTemplate[];
	skills: LauncherSkill[];
	profiles?: LauncherProfile[];
	shortcuts?: LauncherShortcut[];
	columnDefaults?: Record<string, LauncherColumnDefaults>;
	worktreeRootPath?: string;
	branchPrefix?: string;
	conflictResolutionPrompt?: string;
}
export interface MergedLauncherConfig {
	templates: (LauncherTemplate & { scope: 'app' | 'project'; order: number })[];
	skills: (LauncherSkill & { scope: 'app' | 'project'; order: number })[];
	profiles: (LauncherProfile & { scope: 'app' | 'project'; order: number })[];
	shortcuts: (LauncherShortcut & { scope: 'app' | 'project'; order: number })[];
	columnDefaults: Record<string, LauncherColumnDefaults>;
	worktreeRootPath: string | null;
	branchPrefix?: string;
	conflictResolutionPrompt: string;
}

const ordered = { name: v.string(), order: v.optional(v.pipe(v.number(), v.finite())) };
const columnDefaultsSchema = v.looseObject({
	templateName: v.nullable(v.string()), checkedSkills: v.array(v.string()),
	profileName: v.nullable(v.string()),
	lastLayer: v.optional(v.picklist(['editor', 'launcher', 'shortcuts'])),
	skillOrder: v.optional(v.array(v.string())), editedPrompt: v.optional(v.string()),
});
const schema = v.looseObject({
	templates: v.optional(v.array(v.looseObject({ ...ordered, text: v.string() })), () => []),
	skills: v.optional(v.array(v.looseObject({ ...ordered, text: v.string() })), () => []),
	profiles: v.optional(v.array(v.looseObject({ ...ordered, command: v.string() })), () => []),
	shortcuts: v.optional(v.array(v.looseObject({ ...ordered, command: v.string() })), () => []),
	columnDefaults: v.optional(v.unknown()),
	worktreeRootPath: v.optional(v.string()), branchPrefix: v.optional(v.string()),
	conflictResolutionPrompt: v.optional(v.string()),
});

export function decodeLauncherConfig(raw: JsonValue): LauncherConfig {
	const { columnDefaults, ...config } = v.parse(schema, raw);
	if (columnDefaults === undefined) return config;
	if (!v.is(v.objectWithRest({}, v.unknown()), columnDefaults)) {
		throw new Error('columnDefaults must be an object.');
	}
	return {
		...config,
		columnDefaults: Object.fromEntries(Object.entries(columnDefaults)
			.map(([key, value]) => [key, v.parse(columnDefaultsSchema, value)])),
	};
}

export function updateLauncherReferences(
	defaults: LauncherConfig['columnDefaults'], type: LauncherItemType, name: string, replacement: string | null,
): LauncherConfig['columnDefaults'] {
	const updateNames = (names: string[]) => names.flatMap(value =>
		value === name ? replacement === null ? [] : [replacement] : [value]);
	return defaults && Object.fromEntries(Object.entries(defaults).map(([column, value]) => [column, {
		...value,
		templateName: type === 'template' && value.templateName === name ? replacement : value.templateName,
		profileName: type === 'profile' && value.profileName === name ? replacement : value.profileName,
		checkedSkills: type === 'skill' ? updateNames(value.checkedSkills) : value.checkedSkills,
		skillOrder: type === 'skill' && value.skillOrder ? updateNames(value.skillOrder) : value.skillOrder,
	}]));
}

function mergeItems<T extends OrderedLauncherItem>(app: T[], project: T[]) {
	const items = new Map<string, T & { scope: 'app' | 'project' }>();
	for (const item of app) items.set(item.name, { ...item, scope: 'app' });
	for (const item of project) items.set(item.name, { ...item, scope: 'project' });
	return [...items.values()].map((item, index) => ({ ...item, order: item.order ?? index }))
		.sort((a, b) => a.order - b.order);
}

export function mergeLauncherConfigs(app: LauncherConfig, project: LauncherConfig): MergedLauncherConfig {
	return {
		templates: mergeItems(app.templates, project.templates),
		skills: mergeItems(app.skills, project.skills),
		profiles: mergeItems(app.profiles ?? [], project.profiles ?? []),
		shortcuts: mergeItems(app.shortcuts ?? [], project.shortcuts ?? []),
		columnDefaults: project.columnDefaults ?? {},
		worktreeRootPath: project.worktreeRootPath ?? null,
		branchPrefix: project.branchPrefix,
		conflictResolutionPrompt: project.conflictResolutionPrompt || app.conflictResolutionPrompt || '',
	};
}
