import fs from 'fs';
import { RUN_AGENT_PS1, RUN_AGENT_SH } from './platform-scripts.js';
import type { ConfigPaths } from './config-paths.js';

export interface LauncherTemplate {
	name: string;
	text: string;
}

export interface LauncherSkill {
	name: string;
	text: string;
	// Fractional sort key. Skills are shown sorted by `order` ascending across the
	// merged user+project list; dragging sets the moved skill to the midpoint of
	// its neighbours so only that one skill needs rewriting. Optional for legacy
	// configs and freshly added skills (see getMergedConfig for the fallback).
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
	// Per-column display-order override: an explicit list of skill names for this
	// column's launcher. Distinct from the global fractional `order` on
	// LauncherSkill (which orders the merged list everywhere) -- this lets one
	// status reorder its skills without affecting other columns. Applied via
	// orderByNameList; names that no longer exist fall back to the global order.
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

export const DEFAULT_CONFLICT_RESOLUTION_PROMPT =
	'Resolve all merge conflicts, then run git rebase --continue. Repeat until the rebase completes. Then push to remote and verify with git status that everything is clean. CRITICAL: Do not leave untracked, uncommitted or unpushed files. The goal is to sync the local branch with remote.';

const DEFAULT_APP_CONFIG: LauncherConfig = {
	templates: [
		{
			name: 'Default',
			text: 'Current ticket files are in {{ticketDir}}. Read the files there for context.',
		},
	],
	skills: [],
	profiles: [
		{ name: 'Claude Win', command: 'powershell -File {{appConfigDir}}/run-agent.ps1 {{initialPrompt}} {{windowTitle}}' },
		{ name: 'Claude macOS', command: 'bash {{appConfigDir}}/run-agent.sh {{initialPrompt}} {{windowTitle}}' },
	],
};

function emptyConfig(): LauncherConfig {
	return { templates: [], skills: [], profiles: [], shortcuts: [] };
}

function parseConfig(text: string): LauncherConfig {
	const parsed = JSON.parse(text);
	return {
		templates: Array.isArray(parsed.templates) ? parsed.templates : [],
		skills: Array.isArray(parsed.skills) ? parsed.skills : [],
		profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
		shortcuts: Array.isArray(parsed.shortcuts) ? parsed.shortcuts : [],
		columnDefaults: parsed.columnDefaults,
		worktreeRootPath: parsed.worktreeRootPath,
		boardId: parsed.boardId,
		conflictResolutionPrompt: parsed.conflictResolutionPrompt,
	};
}

export class LauncherConfigManager {
	private paths: ConfigPaths;
	private platformScriptsEnsured = false;

	constructor(paths: ConfigPaths) {
		this.paths = paths;
	}

	getAppConfigDir(): string {
		return this.paths.appConfigDir();
	}

	getProjectConfigDir(slug: string): string {
		return this.paths.projectConfigDir(slug);
	}

	private appLauncherPath(): string {
		return this.paths.appLauncherConfigFile();
	}

	private projectLauncherPath(slug: string): string {
		return this.paths.projectLauncherConfigFile(slug);
	}

	private readLauncherFile(filePath: string): LauncherConfig | null {
		const text = this.paths.readConfigFile(filePath);
		if (text === null) return null;
		try {
			return parseConfig(text);
		} catch (e) {
			console.warn(`Failed to parse ${filePath}: ${e instanceof Error ? e.message : e}`);
			return null;
		}
	}

	private writeLauncherFile(filePath: string, config: LauncherConfig): void {
		this.paths.writeConfigFile(filePath, JSON.stringify(config, null, 2));
	}

	loadAppConfig(): LauncherConfig {
		const config = this.readLauncherFile(this.appLauncherPath());
		if (config === null) {
			const defaults = structuredClone(DEFAULT_APP_CONFIG);
			this.writeLauncherFile(this.appLauncherPath(), defaults);
			this.ensurePlatformScripts();
			return defaults;
		}
		this.ensurePlatformScripts();
		return config;
	}

	loadProjectConfig(slug: string): LauncherConfig {
		return this.readLauncherFile(this.projectLauncherPath(slug)) ?? emptyConfig();
	}

	saveAppConfig(config: LauncherConfig): void {
		this.writeLauncherFile(this.appLauncherPath(), config);
	}

	saveProjectConfig(slug: string, config: LauncherConfig): void {
		this.writeLauncherFile(this.projectLauncherPath(slug), config);
	}

	getMergedConfig(slug: string): MergedLauncherConfig {
		const app = this.loadAppConfig();
		const project = this.loadProjectConfig(slug);

		const templateMap = new Map<string, LauncherTemplate & { scope: "app" | "project" }>();
		for (const t of app.templates) {
			templateMap.set(t.name, { ...t, scope: "app" });
		}
		for (const t of project.templates) {
			templateMap.set(t.name, { ...t, scope: "project" });
		}

		const skillMap = new Map<string, LauncherSkill & { scope: "app" | "project" }>();
		for (const s of app.skills) {
			skillMap.set(s.name, { ...s, scope: "app" });
		}
		for (const s of project.skills) {
			skillMap.set(s.name, { ...s, scope: "project" });
		}
		// Resolve every skill to a concrete order: an explicit `order` wins,
		// otherwise fall back to the canonical (user-then-project) index so legacy
		// and un-dragged skills keep their original position. Sort is stable, so
		// equal orders preserve canonical order.
		const sortedSkills = [...skillMap.values()]
			.map((s, i) => ({ ...s, order: typeof s.order === "number" && Number.isFinite(s.order) ? s.order : i }))
			.sort((a, b) => a.order - b.order);

		const profileMap = new Map<string, LauncherProfile & { scope: "app" | "project" }>();
		for (const p of app.profiles ?? []) {
			profileMap.set(p.name, { ...p, scope: "app" });
		}
		for (const p of project.profiles ?? []) {
			profileMap.set(p.name, { ...p, scope: "project" });
		}

		const shortcutMap = new Map<string, LauncherShortcut & { scope: "app" | "project" }>();
		for (const s of app.shortcuts ?? []) {
			shortcutMap.set(s.name, { ...s, scope: "app" });
		}
		for (const s of project.shortcuts ?? []) {
			shortcutMap.set(s.name, { ...s, scope: "project" });
		}

		return {
			templates: [...templateMap.values()],
			skills: sortedSkills,
			profiles: [...profileMap.values()],
			shortcuts: [...shortcutMap.values()],
			columnDefaults: project.columnDefaults ?? {},
			worktreeRootPath: project.worktreeRootPath ?? null,
			boardId: project.boardId ?? null,
			conflictResolutionPrompt: typeof project.conflictResolutionPrompt === 'string' && project.conflictResolutionPrompt
				? project.conflictResolutionPrompt
				: DEFAULT_CONFLICT_RESOLUTION_PROMPT,
		};
	}

	saveColumnDefaults(slug: string, column: string, patch: Partial<LauncherColumnDefaults>): void {
		const config = this.loadProjectConfig(slug);
		const columnDefaults = config.columnDefaults ?? {};
		const existing = Object.prototype.hasOwnProperty.call(columnDefaults, column) ? columnDefaults[column] : { templateName: null, checkedSkills: [], profileName: null };
		// defineProperty instead of bracket assignment to safely handle column="__proto__"
		Object.defineProperty(columnDefaults, column, { value: { ...existing, ...patch }, writable: true, enumerable: true, configurable: true });
		this.saveProjectConfig(slug, { ...config, columnDefaults });
	}

	private forEachColumnDefault(config: LauncherConfig, fn: (cd: LauncherColumnDefaults) => void): void {
		if (!config.columnDefaults) return;
		for (const col of Object.keys(config.columnDefaults)) {
			const cd = config.columnDefaults[col];
			if (cd) fn(cd);
		}
	}

	private withConfig(scope: "app" | "project", slug: string, fn: (config: LauncherConfig) => void): void {
		const config = scope === "app" ? this.loadAppConfig() : this.loadProjectConfig(slug);
		fn(config);
		if (scope === "app") {
			this.saveAppConfig(config);
		} else {
			this.saveProjectConfig(slug, config);
		}
	}

	addTemplate(scope: "app" | "project", slug: string, template: LauncherTemplate): void {
		this.withConfig(scope, slug, (config) => {
			if (config.templates.some(t => t.name === template.name)) {
				throw new Error(`Template with name "${template.name}" already exists`);
			}
			config.templates.push(template);
		});
	}

	addSkill(scope: "app" | "project", slug: string, skill: LauncherSkill): void {
		this.withConfig(scope, slug, (config) => {
			if (config.skills.some(s => s.name === skill.name)) {
				throw new Error(`Skill with name "${skill.name}" already exists`);
			}
			config.skills.push(skill);
		});
	}

	removeTemplate(scope: "app" | "project", slug: string, name: string): void {
		this.withConfig(scope, slug, (config) => {
			config.templates = config.templates.filter(t => t.name !== name);
			this.forEachColumnDefault(config, (cd) => {
				if (cd.templateName === name) {
					cd.templateName = null;
				}
			});
		});
	}

	removeSkill(scope: "app" | "project", slug: string, name: string): void {
		this.withConfig(scope, slug, (config) => {
			config.skills = config.skills.filter(s => s.name !== name);
			this.forEachColumnDefault(config, (cd) => {
				if (cd.checkedSkills) {
					cd.checkedSkills = cd.checkedSkills.filter(s => s !== name);
				}
				if (cd.skillOrder) {
					cd.skillOrder = cd.skillOrder.filter(s => s !== name);
				}
			});
		});
	}

	updateTemplate(scope: "app" | "project", slug: string, oldName: string, template: LauncherTemplate): void {
		this.withConfig(scope, slug, (config) => {
			const index = config.templates.findIndex(t => t.name === oldName);
			if (index < 0) throw new Error(`Template "${oldName}" not found`);
			if (oldName !== template.name && config.templates.some(t => t.name === template.name)) {
				throw new Error(`Template with name "${template.name}" already exists`);
			}
			config.templates[index] = { name: template.name, text: template.text };
			if (oldName !== template.name) {
				this.forEachColumnDefault(config, (cd) => {
					if (cd.templateName === oldName) {
						cd.templateName = template.name;
					}
				});
			}
		});
	}

	updateSkill(scope: "app" | "project", slug: string, oldName: string, skill: LauncherSkill): void {
		this.withConfig(scope, slug, (config) => {
			const index = config.skills.findIndex(s => s.name === oldName);
			if (index < 0) throw new Error(`Skill "${oldName}" not found`);
			if (oldName !== skill.name && config.skills.some(s => s.name === skill.name)) {
				throw new Error(`Skill with name "${skill.name}" already exists`);
			}
			// Preserve the sort key; editing name/text must not move the skill.
			const order = config.skills[index].order;
			config.skills[index] = order === undefined ? { name: skill.name, text: skill.text } : { name: skill.name, text: skill.text, order };
			if (oldName !== skill.name) {
				this.forEachColumnDefault(config, (cd) => {
					if (cd.checkedSkills) {
						cd.checkedSkills = cd.checkedSkills.map(s => s === oldName ? skill.name : s);
					}
					if (cd.skillOrder) {
						cd.skillOrder = cd.skillOrder.map(s => s === oldName ? skill.name : s);
					}
				});
			}
		});
	}

	setSkillOrder(scope: "app" | "project", slug: string, name: string, order: number): void {
		if (typeof order !== "number" || !Number.isFinite(order)) {
			throw new Error("order must be a finite number");
		}
		this.withConfig(scope, slug, (config) => {
			const skill = config.skills.find(s => s.name === name);
			if (!skill) throw new Error(`Skill "${name}" not found`);
			skill.order = order;
		});
	}

	addProfile(scope: "app" | "project", slug: string, profile: LauncherProfile): void {
		this.withConfig(scope, slug, (config) => {
			if (!config.profiles) config.profiles = [];
			if (config.profiles.some(p => p.name === profile.name)) {
				throw new Error(`Profile with name "${profile.name}" already exists`);
			}
			config.profiles.push(profile);
		});
	}

	removeProfile(scope: "app" | "project", slug: string, name: string): void {
		this.withConfig(scope, slug, (config) => {
			config.profiles = (config.profiles ?? []).filter(p => p.name !== name);
			this.forEachColumnDefault(config, (cd) => {
				if (cd.profileName === name) {
					cd.profileName = null;
				}
			});
		});
	}

	updateProfile(scope: "app" | "project", slug: string, oldName: string, profile: LauncherProfile): void {
		this.withConfig(scope, slug, (config) => {
			if (!config.profiles) config.profiles = [];
			const index = config.profiles.findIndex(p => p.name === oldName);
			if (index < 0) throw new Error(`Profile "${oldName}" not found`);
			if (oldName !== profile.name && config.profiles.some(p => p.name === profile.name)) {
				throw new Error(`Profile with name "${profile.name}" already exists`);
			}
			config.profiles[index] = { name: profile.name, command: profile.command };
			if (oldName !== profile.name) {
				this.forEachColumnDefault(config, (cd) => {
					if (cd.profileName === oldName) {
						cd.profileName = profile.name;
					}
				});
			}
		});
	}

	addShortcut(scope: "app" | "project", slug: string, shortcut: LauncherShortcut): void {
		this.withConfig(scope, slug, (config) => {
			if (!config.shortcuts) config.shortcuts = [];
			if (config.shortcuts.some(s => s.name === shortcut.name)) {
				throw new Error(`Shortcut with name "${shortcut.name}" already exists`);
			}
			config.shortcuts.push(shortcut);
		});
	}

	removeShortcut(scope: "app" | "project", slug: string, name: string): void {
		this.withConfig(scope, slug, (config) => {
			config.shortcuts = (config.shortcuts ?? []).filter(s => s.name !== name);
		});
	}

	updateShortcut(scope: "app" | "project", slug: string, oldName: string, shortcut: LauncherShortcut): void {
		this.withConfig(scope, slug, (config) => {
			if (!config.shortcuts) config.shortcuts = [];
			const index = config.shortcuts.findIndex(s => s.name === oldName);
			if (index < 0) throw new Error(`Shortcut "${oldName}" not found`);
			if (oldName !== shortcut.name && config.shortcuts.some(s => s.name === shortcut.name)) {
				throw new Error(`Shortcut with name "${shortcut.name}" already exists`);
			}
			config.shortcuts[index] = { name: shortcut.name, command: shortcut.command };
		});
	}

	saveWorktreeRootPath(slug: string, worktreeRootPath: string | undefined): void {
		const config = this.loadProjectConfig(slug);
		config.worktreeRootPath = worktreeRootPath;
		this.saveProjectConfig(slug, config);
	}

	saveConflictResolutionSettings(slug: string, prompt: string | undefined): void {
		const config = this.loadProjectConfig(slug);
		config.conflictResolutionPrompt = prompt;
		this.saveProjectConfig(slug, config);
	}

	ensurePlatformScripts(): void {
		if (this.platformScriptsEnsured) return;
		const ps1Path = this.paths.platformScriptPs1();
		const shPath = this.paths.platformScriptSh();
		if (!fs.existsSync(ps1Path)) {
			this.paths.writeConfigFile(ps1Path, RUN_AGENT_PS1);
		}
		if (!fs.existsSync(shPath)) {
			this.paths.writeConfigFile(shPath, RUN_AGENT_SH);
		}
		this.platformScriptsEnsured = true;
	}
}
