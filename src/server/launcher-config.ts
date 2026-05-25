import fs from 'fs';
import type {
	LauncherConfig,
	LauncherTemplate,
	LauncherSkill,
	LauncherProfile,
	LauncherColumnDefaults,
	MergedLauncherConfig,
} from '../types.js';
import { RUN_AGENT_PS1, RUN_AGENT_SH } from './platform-scripts.js';
import type { ConfigPaths } from './config-paths.js';

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
	return { templates: [], skills: [], profiles: [] };
}

function parseConfig(text: string): LauncherConfig {
	const parsed = JSON.parse(text);
	return {
		templates: Array.isArray(parsed.templates) ? parsed.templates : [],
		skills: Array.isArray(parsed.skills) ? parsed.skills : [],
		profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
		columnDefaults: parsed.columnDefaults,
		worktreeRootPath: parsed.worktreeRootPath,
		boardId: parsed.boardId,
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

		const profileMap = new Map<string, LauncherProfile & { scope: "app" | "project" }>();
		for (const p of app.profiles ?? []) {
			profileMap.set(p.name, { ...p, scope: "app" });
		}
		for (const p of project.profiles ?? []) {
			profileMap.set(p.name, { ...p, scope: "project" });
		}

		return {
			templates: [...templateMap.values()],
			skills: [...skillMap.values()],
			profiles: [...profileMap.values()],
			columnDefaults: project.columnDefaults ?? {},
			worktreeRootPath: project.worktreeRootPath ?? null,
			boardId: project.boardId ?? null,
		};
	}

	saveColumnDefaults(slug: string, column: string, defaults: LauncherColumnDefaults): void {
		const config = this.loadProjectConfig(slug);
		const columnDefaults = config.columnDefaults ?? {};
		// Object.defineProperty to safely handle __proto__ as a key
		Object.defineProperty(columnDefaults, column, { value: defaults, writable: true, enumerable: true, configurable: true });
		this.saveProjectConfig(slug, { ...config, columnDefaults });
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
			if (config.columnDefaults) {
				for (const col of Object.keys(config.columnDefaults)) {
					if (config.columnDefaults[col]?.templateName === name) {
						config.columnDefaults[col].templateName = null;
					}
				}
			}
		});
	}

	removeSkill(scope: "app" | "project", slug: string, name: string): void {
		this.withConfig(scope, slug, (config) => {
			config.skills = config.skills.filter(s => s.name !== name);
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
		});
	}

	updateSkill(scope: "app" | "project", slug: string, oldName: string, skill: LauncherSkill): void {
		this.withConfig(scope, slug, (config) => {
			const index = config.skills.findIndex(s => s.name === oldName);
			if (index < 0) throw new Error(`Skill "${oldName}" not found`);
			if (oldName !== skill.name && config.skills.some(s => s.name === skill.name)) {
				throw new Error(`Skill with name "${skill.name}" already exists`);
			}
			config.skills[index] = { name: skill.name, text: skill.text };
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
			if (config.columnDefaults) {
				for (const col of Object.keys(config.columnDefaults)) {
					if (config.columnDefaults[col]?.profileName === name) {
						config.columnDefaults[col].profileName = null;
					}
				}
			}
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
		});
	}

	saveWorktreeRootPath(slug: string, worktreeRootPath: string | undefined): void {
		const config = this.loadProjectConfig(slug);
		config.worktreeRootPath = worktreeRootPath;
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
