import path from 'path';
import * as v from 'valibot';
import type { ConfigPaths } from '../config/config-paths.js';
import { ConfigRepository } from '../config/config-repository.js';

export interface LauncherTemplate {
	name: string;
	text: string;
}

export interface LauncherSkill {
	name: string;
	text: string;
	order?: number;
}

export interface LauncherProfile {
	name: string;
	command: string;
}

export interface LauncherShortcut {
	name: string;
	command: string;
}

export interface LauncherColumnDefaults {
	templateName: string | null;
	checkedSkills: string[];
	profileName: string | null;
	lastLayer?: "editor" | "launcher" | "shortcuts";
	skillOrder?: string[];
}

export interface LauncherConfig {
	templates: LauncherTemplate[];
	skills: LauncherSkill[];
	profiles?: LauncherProfile[];
	shortcuts?: LauncherShortcut[];
	columnDefaults?: Record<string, LauncherColumnDefaults>;
	worktreeRootPath?: string;
	conflictResolutionPrompt?: string;
}

export interface MergedLauncherConfig {
	templates: (LauncherTemplate & { scope: "app" | "project" })[];
	skills: (LauncherSkill & { scope: "app" | "project"; order: number })[];
	profiles: (LauncherProfile & { scope: "app" | "project" })[];
	shortcuts: (LauncherShortcut & { scope: "app" | "project" })[];
	columnDefaults: Record<string, LauncherColumnDefaults>;
	worktreeRootPath: string | null;
	conflictResolutionPrompt: string;
}

export const SetBoardIdBody = v.object({
	boardId: v.pipe(v.string(), v.nonEmpty("Missing required field: boardId")),
});
export type SetBoardIdBody = v.InferOutput<typeof SetBoardIdBody>;

export const SetProjectNameBody = v.object({
	name: v.string(),
});
export type SetProjectNameBody = v.InferOutput<typeof SetProjectNameBody>;

export const WorktreeRootPathBody = v.object({
	worktreeRootPath: v.optional(v.string()),
});
export type WorktreeRootPathBody = v.InferOutput<typeof WorktreeRootPathBody>;

export const ConflictResolutionBody = v.object({
	conflictResolutionPrompt: v.optional(v.string()),
});
export type ConflictResolutionBody = v.InferOutput<typeof ConflictResolutionBody>;

export const ColumnDefaultsBody = v.object({
	column: v.string(),
	templateName: v.optional(v.nullable(v.string())),
	checkedSkills: v.optional(v.array(v.string())),
	profileName: v.optional(v.nullable(v.string())),
	lastLayer: v.optional(v.picklist(["editor", "launcher", "shortcuts"])),
	skillOrder: v.optional(v.array(v.string())),
});
export type ColumnDefaultsBody = v.InferOutput<typeof ColumnDefaultsBody>;

export const ProfileNameBody = v.object({
	profileName: v.pipe(v.string(), v.nonEmpty("profileName is required")),
});
export type ProfileNameBody = v.InferOutput<typeof ProfileNameBody>;

export const ResolveConflictsBody = v.object({
	profileName: v.pipe(v.string(), v.nonEmpty("No profile selected")),
});
export type ResolveConflictsBody = v.InferOutput<typeof ResolveConflictsBody>;

export const RunShortcutBody = v.object({
	name: v.string(),
	useWorktree: v.optional(v.boolean(), false),
	force: v.optional(v.boolean(), false),
});
export type RunShortcutBody = v.InferOutput<typeof RunShortcutBody>;

function parseConfig(raw: unknown): LauncherConfig {
	const parsed = raw as Record<string, unknown>;
	return {
		templates: (parsed.templates as LauncherTemplate[]) ?? [],
		skills: (parsed.skills as LauncherSkill[]) ?? [],
		profiles: (parsed.profiles as LauncherProfile[]) ?? [],
		shortcuts: (parsed.shortcuts as LauncherShortcut[]) ?? [],
		columnDefaults: parsed.columnDefaults as Record<string, LauncherColumnDefaults> | undefined,
		worktreeRootPath: parsed.worktreeRootPath as string | undefined,
		conflictResolutionPrompt: parsed.conflictResolutionPrompt as string | undefined,
	};
}

function mergeByName<T extends { name: string }>(
	appItems: T[],
	projectItems: T[],
): (T & { scope: "app" | "project" })[] {
	const map = new Map<string, T & { scope: "app" | "project" }>();
	for (const item of appItems) {
		map.set(item.name, { ...item, scope: "app" });
	}
	for (const item of projectItems) {
		map.set(item.name, { ...item, scope: "project" });
	}
	return [...map.values()];
}

export function mergeLauncherConfigs(
	app: LauncherConfig,
	project: LauncherConfig,
): MergedLauncherConfig {
	const mergedSkills = mergeByName(app.skills, project.skills);
	const sortedSkills = mergedSkills
		.map((s, i) => ({
			...s,
			order:
				typeof s.order === "number" && Number.isFinite(s.order)
					? s.order
					: i,
		}))
		.sort((a, b) => a.order - b.order);

	const appPrompt =
		typeof app.conflictResolutionPrompt === 'string'
		&& app.conflictResolutionPrompt
			? app.conflictResolutionPrompt
			: '';

	return {
		templates: mergeByName(app.templates, project.templates),
		skills: sortedSkills,
		profiles: mergeByName(app.profiles ?? [], project.profiles ?? []),
		shortcuts: mergeByName(app.shortcuts ?? [], project.shortcuts ?? []),
		columnDefaults: project.columnDefaults ?? {},
		worktreeRootPath: project.worktreeRootPath ?? null,
		conflictResolutionPrompt:
			typeof project.conflictResolutionPrompt === 'string'
			&& project.conflictResolutionPrompt
				? project.conflictResolutionPrompt
				: appPrompt,
	};
}

export class LauncherConfigManager {
	private paths: ConfigPaths;
	private configRepo: ConfigRepository;

	constructor(paths: ConfigPaths, configRepo?: ConfigRepository) {
		this.paths = paths;
		this.configRepo = configRepo ?? new ConfigRepository();
	}

	getAppConfigDir(): string {
		return this.paths.appConfigDir();
	}

	getConfigDefaultsDir(): string {
		return this.paths.configDefaults();
	}

	getProjectDir(projectSlug: string): string {
		return this.paths.projectDir(projectSlug);
	}

	private appLauncherPath(): string {
		return this.paths.appLauncherConfigFile();
	}

	private projectLauncherPath(projectSlug: string): string {
		return this.paths.projectLauncherConfigFile(projectSlug);
	}

	private readLauncherFile(filePath: string): LauncherConfig | null {
		const raw = this.configRepo.readJson(filePath);
		if (raw === null) return null;
		return parseConfig(raw);
	}

	private writeLauncherFile(
		filePath: string,
		config: LauncherConfig,
	): void {
		this.configRepo.writeJson(filePath, config);
	}

	loadAppConfig(): LauncherConfig {
		const filePath = this.appLauncherPath();
		const config = this.readLauncherFile(filePath);
		if (config === null) {
			throw new Error(
				`App launcher config not found: ${filePath}`,
			);
		}
		return config;
	}

	loadProjectConfig(projectSlug: string): LauncherConfig {
		return this.readLauncherFile(this.projectLauncherPath(projectSlug))
			?? this.readDefaultProjectConfig();
	}

	private readDefaultProjectConfig(): LauncherConfig {
		const filePath = path.join(this.paths.configDefaults(), 'project-launcher-config.json');
		const raw = this.configRepo.readJson(filePath);
		if (raw === null) {
			throw new Error(`Default project launcher config not found: ${filePath}`);
		}
		return parseConfig(raw);
	}

	saveAppConfig(config: LauncherConfig): void {
		this.writeLauncherFile(this.appLauncherPath(), config);
	}

	saveProjectConfig(
		projectSlug: string,
		config: LauncherConfig,
	): void {
		this.writeLauncherFile(
			this.projectLauncherPath(projectSlug),
			config,
		);
	}

	getMergedConfig(projectSlug: string): MergedLauncherConfig {
		const app = this.loadAppConfig();
		const project = this.loadProjectConfig(projectSlug);
		return mergeLauncherConfigs(app, project);
	}

	saveColumnDefaults(
		projectSlug: string,
		column: string,
		patch: Partial<LauncherColumnDefaults>,
	): void {
		const config = this.loadProjectConfig(projectSlug);
		const columnDefaults = config.columnDefaults ?? {};
		const existing = Object.prototype.hasOwnProperty.call(
			columnDefaults,
			column,
		)
			? columnDefaults[column]
			: {
				templateName: null,
				checkedSkills: [],
				profileName: null,
			};
		Object.defineProperty(columnDefaults, column, {
			value: { ...existing, ...patch },
			writable: true,
			enumerable: true,
			configurable: true,
		});
		this.saveProjectConfig(projectSlug, {
			...config,
			columnDefaults,
		});
	}

	private forEachColumnDefault(
		config: LauncherConfig,
		fn: (cd: LauncherColumnDefaults) => void,
	): void {
		if (!config.columnDefaults) return;
		for (const col of Object.keys(config.columnDefaults)) {
			const cd = config.columnDefaults[col];
			if (cd) fn(cd);
		}
	}

	private withConfig(
		scope: "app" | "project",
		projectSlug: string,
		fn: (config: LauncherConfig) => void,
	): void {
		const config =
			scope === "app"
				? this.loadAppConfig()
				: this.loadProjectConfig(projectSlug);
		fn(config);
		if (scope === "app") {
			this.saveAppConfig(config);
		} else {
			this.saveProjectConfig(projectSlug, config);
		}
	}

	addTemplate(
		scope: "app" | "project",
		projectSlug: string,
		template: LauncherTemplate,
	): void {
		this.withConfig(scope, projectSlug, (config) => {
			if (config.templates.some((t) => t.name === template.name)) {
				throw new Error(
					`Template with name "${template.name}" already exists`,
				);
			}
			config.templates.push(template);
		});
	}

	addSkill(
		scope: "app" | "project",
		projectSlug: string,
		skill: LauncherSkill,
	): void {
		this.withConfig(scope, projectSlug, (config) => {
			if (config.skills.some((s) => s.name === skill.name)) {
				throw new Error(
					`Skill with name "${skill.name}" already exists`,
				);
			}
			config.skills.push(skill);
		});
	}

	removeTemplate(
		scope: "app" | "project",
		projectSlug: string,
		name: string,
	): void {
		this.withConfig(scope, projectSlug, (config) => {
			config.templates = config.templates.filter(
				(t) => t.name !== name,
			);
			this.forEachColumnDefault(config, (cd) => {
				if (cd.templateName === name) {
					cd.templateName = null;
				}
			});
		});
	}

	removeSkill(
		scope: "app" | "project",
		projectSlug: string,
		name: string,
	): void {
		this.withConfig(scope, projectSlug, (config) => {
			config.skills = config.skills.filter(
				(s) => s.name !== name,
			);
			this.forEachColumnDefault(config, (cd) => {
				if (cd.checkedSkills) {
					cd.checkedSkills = cd.checkedSkills.filter(
						(s) => s !== name,
					);
				}
				if (cd.skillOrder) {
					cd.skillOrder = cd.skillOrder.filter(
						(s) => s !== name,
					);
				}
			});
		});
	}

	updateTemplate(
		scope: "app" | "project",
		projectSlug: string,
		oldName: string,
		template: LauncherTemplate,
	): void {
		this.withConfig(scope, projectSlug, (config) => {
			const index = config.templates.findIndex(
				(t) => t.name === oldName,
			);
			if (index < 0) {
				throw new Error(`Template "${oldName}" not found`);
			}
			if (
				oldName !== template.name
				&& config.templates.some(
					(t) => t.name === template.name,
				)
			) {
				throw new Error(
					`Template with name "${template.name}" already exists`,
				);
			}
			config.templates[index] = {
				name: template.name,
				text: template.text,
			};
			if (oldName !== template.name) {
				this.forEachColumnDefault(config, (cd) => {
					if (cd.templateName === oldName) {
						cd.templateName = template.name;
					}
				});
			}
		});
	}

	updateSkill(
		scope: "app" | "project",
		projectSlug: string,
		oldName: string,
		skill: LauncherSkill,
	): void {
		this.withConfig(scope, projectSlug, (config) => {
			const index = config.skills.findIndex(
				(s) => s.name === oldName,
			);
			if (index < 0) {
				throw new Error(`Skill "${oldName}" not found`);
			}
			if (
				oldName !== skill.name
				&& config.skills.some((s) => s.name === skill.name)
			) {
				throw new Error(
					`Skill with name "${skill.name}" already exists`,
				);
			}
			const order = config.skills[index].order;
			config.skills[index] =
				order === undefined
					? { name: skill.name, text: skill.text }
					: { name: skill.name, text: skill.text, order };
			if (oldName !== skill.name) {
				this.forEachColumnDefault(config, (cd) => {
					if (cd.checkedSkills) {
						cd.checkedSkills = cd.checkedSkills.map((s) =>
							s === oldName ? skill.name : s,
						);
					}
					if (cd.skillOrder) {
						cd.skillOrder = cd.skillOrder.map((s) =>
							s === oldName ? skill.name : s,
						);
					}
				});
			}
		});
	}

	setSkillOrder(
		scope: "app" | "project",
		projectSlug: string,
		name: string,
		order: number,
	): void {
		if (typeof order !== "number" || !Number.isFinite(order)) {
			throw new Error("order must be a finite number");
		}
		this.withConfig(scope, projectSlug, (config) => {
			const skill = config.skills.find((s) => s.name === name);
			if (!skill) throw new Error(`Skill "${name}" not found`);
			skill.order = order;
		});
	}

	addProfile(
		scope: "app" | "project",
		projectSlug: string,
		profile: LauncherProfile,
	): void {
		this.withConfig(scope, projectSlug, (config) => {
			if (!config.profiles) config.profiles = [];
			if (config.profiles.some((p) => p.name === profile.name)) {
				throw new Error(
					`Profile with name "${profile.name}" already exists`,
				);
			}
			config.profiles.push(profile);
		});
	}

	removeProfile(
		scope: "app" | "project",
		projectSlug: string,
		name: string,
	): void {
		this.withConfig(scope, projectSlug, (config) => {
			config.profiles = (config.profiles ?? []).filter(
				(p) => p.name !== name,
			);
			this.forEachColumnDefault(config, (cd) => {
				if (cd.profileName === name) {
					cd.profileName = null;
				}
			});
		});
	}

	updateProfile(
		scope: "app" | "project",
		projectSlug: string,
		oldName: string,
		profile: LauncherProfile,
	): void {
		this.withConfig(scope, projectSlug, (config) => {
			if (!config.profiles) config.profiles = [];
			const index = config.profiles.findIndex(
				(p) => p.name === oldName,
			);
			if (index < 0) {
				throw new Error(`Profile "${oldName}" not found`);
			}
			if (
				oldName !== profile.name
				&& config.profiles.some(
					(p) => p.name === profile.name,
				)
			) {
				throw new Error(
					`Profile with name "${profile.name}" already exists`,
				);
			}
			config.profiles[index] = {
				name: profile.name,
				command: profile.command,
			};
			if (oldName !== profile.name) {
				this.forEachColumnDefault(config, (cd) => {
					if (cd.profileName === oldName) {
						cd.profileName = profile.name;
					}
				});
			}
		});
	}

	addShortcut(
		scope: "app" | "project",
		projectSlug: string,
		shortcut: LauncherShortcut,
	): void {
		this.withConfig(scope, projectSlug, (config) => {
			if (!config.shortcuts) config.shortcuts = [];
			if (
				config.shortcuts.some(
					(s) => s.name === shortcut.name,
				)
			) {
				throw new Error(
					`Shortcut with name "${shortcut.name}" already exists`,
				);
			}
			config.shortcuts.push(shortcut);
		});
	}

	removeShortcut(
		scope: "app" | "project",
		projectSlug: string,
		name: string,
	): void {
		this.withConfig(scope, projectSlug, (config) => {
			config.shortcuts = (config.shortcuts ?? []).filter(
				(s) => s.name !== name,
			);
		});
	}

	updateShortcut(
		scope: "app" | "project",
		projectSlug: string,
		oldName: string,
		shortcut: LauncherShortcut,
	): void {
		this.withConfig(scope, projectSlug, (config) => {
			if (!config.shortcuts) config.shortcuts = [];
			const index = config.shortcuts.findIndex(
				(s) => s.name === oldName,
			);
			if (index < 0) {
				throw new Error(`Shortcut "${oldName}" not found`);
			}
			if (
				oldName !== shortcut.name
				&& config.shortcuts.some(
					(s) => s.name === shortcut.name,
				)
			) {
				throw new Error(
					`Shortcut with name "${shortcut.name}" already exists`,
				);
			}
			config.shortcuts[index] = {
				name: shortcut.name,
				command: shortcut.command,
			};
		});
	}

	saveWorktreeRootPath(
		projectSlug: string,
		worktreeRootPath: string | undefined,
	): void {
		const config = this.loadProjectConfig(projectSlug);
		config.worktreeRootPath = worktreeRootPath;
		this.saveProjectConfig(projectSlug, config);
	}

	saveConflictResolutionSettings(
		projectSlug: string,
		prompt: string | undefined,
	): void {
		const config = this.loadProjectConfig(projectSlug);
		config.conflictResolutionPrompt = prompt;
		this.saveProjectConfig(projectSlug, config);
	}
}
