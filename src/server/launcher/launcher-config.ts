import type { ConfigPaths } from '../config/config-paths.js';
import EMPTY_PROJECT_CONFIG from '../../../config-defaults/project-launcher-config.json';

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
	boardId?: string;
	conflictResolutionPrompt?: string;
}

export interface MergedLauncherConfig {
	templates: (LauncherTemplate & { scope: "app" | "project" })[];
	skills: (LauncherSkill & { scope: "app" | "project"; order: number })[];
	profiles: (LauncherProfile & { scope: "app" | "project" })[];
	shortcuts: (LauncherShortcut & { scope: "app" | "project" })[];
	columnDefaults: Record<string, LauncherColumnDefaults>;
	worktreeRootPath: string | null;
	boardId: string | null;
	conflictResolutionPrompt: string;
}

function parseConfig(text: string): LauncherConfig {
	const parsed = JSON.parse(text);
	return {
		templates: parsed.templates ?? [],
		skills: parsed.skills ?? [],
		profiles: parsed.profiles ?? [],
		shortcuts: parsed.shortcuts ?? [],
		columnDefaults: parsed.columnDefaults,
		worktreeRootPath: parsed.worktreeRootPath,
		boardId: parsed.boardId,
		conflictResolutionPrompt: parsed.conflictResolutionPrompt,
	};
}

export class LauncherConfigManager {
	private paths: ConfigPaths;

	constructor(paths: ConfigPaths) {
		this.paths = paths;
	}

	getAppConfigDir(): string {
		return this.paths.appConfigDir();
	}

	getProjectConfigDir(projectSlug: string): string {
		return this.paths.projectConfigDir(projectSlug);
	}

	private appLauncherPath(): string {
		return this.paths.appLauncherConfigFile();
	}

	private projectLauncherPath(projectSlug: string): string {
		return this.paths.projectLauncherConfigFile(projectSlug);
	}

	private readLauncherFile(filePath: string): LauncherConfig | null {
		const text = this.paths.readConfigFile(filePath);
		if (text === null) return null;
		return parseConfig(text);
	}

	private writeLauncherFile(
		filePath: string,
		config: LauncherConfig,
	): void {
		this.paths.writeConfigFile(
			filePath,
			JSON.stringify(config, null, 2),
		);
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
		return (
			this.readLauncherFile(
				this.projectLauncherPath(projectSlug),
			) ?? structuredClone(EMPTY_PROJECT_CONFIG) as LauncherConfig
		);
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

		const templateMap = new Map<
			string,
			LauncherTemplate & { scope: "app" | "project" }
		>();
		for (const t of app.templates) {
			templateMap.set(t.name, { ...t, scope: "app" });
		}
		for (const t of project.templates) {
			templateMap.set(t.name, { ...t, scope: "project" });
		}

		const skillMap = new Map<
			string,
			LauncherSkill & { scope: "app" | "project" }
		>();
		for (const s of app.skills) {
			skillMap.set(s.name, { ...s, scope: "app" });
		}
		for (const s of project.skills) {
			skillMap.set(s.name, { ...s, scope: "project" });
		}
		const sortedSkills = [...skillMap.values()]
			.map((s, i) => ({
				...s,
				order:
					typeof s.order === "number" && Number.isFinite(s.order)
						? s.order
						: i,
			}))
			.sort((a, b) => a.order - b.order);

		const profileMap = new Map<
			string,
			LauncherProfile & { scope: "app" | "project" }
		>();
		for (const p of app.profiles ?? []) {
			profileMap.set(p.name, { ...p, scope: "app" });
		}
		for (const p of project.profiles ?? []) {
			profileMap.set(p.name, { ...p, scope: "project" });
		}

		const shortcutMap = new Map<
			string,
			LauncherShortcut & { scope: "app" | "project" }
		>();
		for (const s of app.shortcuts ?? []) {
			shortcutMap.set(s.name, { ...s, scope: "app" });
		}
		for (const s of project.shortcuts ?? []) {
			shortcutMap.set(s.name, { ...s, scope: "project" });
		}

		const appPrompt =
			typeof app.conflictResolutionPrompt === 'string'
			&& app.conflictResolutionPrompt
				? app.conflictResolutionPrompt
				: '';

		return {
			templates: [...templateMap.values()],
			skills: sortedSkills,
			profiles: [...profileMap.values()],
			shortcuts: [...shortcutMap.values()],
			columnDefaults: project.columnDefaults ?? {},
			worktreeRootPath: project.worktreeRootPath ?? null,
			boardId: project.boardId ?? null,
			conflictResolutionPrompt:
				typeof project.conflictResolutionPrompt === 'string'
				&& project.conflictResolutionPrompt
					? project.conflictResolutionPrompt
					: appPrompt,
		};
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
