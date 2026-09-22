import fs from 'fs';
import path from 'path';
import * as v from 'valibot';
import type { ConfigPaths } from '../config/config-paths.js';
import { ConfigRepository } from '../config/config-repository.js';
import { AppConfigStore } from '../config/app-config-store.js';
import type { ProjectEntry } from '../config/app-config-data.js';
export type { ProjectEntry } from '../config/app-config-data.js';

export interface ProjectInfo extends ProjectEntry {
	available: boolean;
	name: string;
}

export const AddProjectBody = v.object({
	path: v.string(),
	branch: v.optional(v.string()),
	mainBranch: v.optional(v.string()),
	boardId: v.optional(v.string()),
	name: v.optional(v.string()),
});
export type AddProjectBody = v.InferOutput<typeof AddProjectBody>;

function isGitRepo(dirPath: string, configRepo: ConfigRepository): boolean {
	try {
		return configRepo.exists(dirPath) && configRepo.exists(path.join(dirPath, '.git'));
	} catch {
		return false;
	}
}

function entryToInfo(entry: ProjectEntry, configRepo: ConfigRepository): ProjectInfo {
	return {
		path: entry.path,
		projectSlug: entry.projectSlug,
		available: isGitRepo(entry.path, configRepo),
		name: entry.name || entry.projectSlug,
		branch: entry.branch,
		ticketsPath: entry.ticketsPath,
		mainBranch: entry.mainBranch,
		boardId: entry.boardId,
	};
}

function toSlugSegment(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
}

export function validateBranchName(name: string): void {
	if (!name) throw new Error('Branch name cannot be empty');
	if (/\s/.test(name)) throw new Error('Branch name cannot contain whitespace');
	if (/[~^:?*[\\\x00-\x1f\x7f]/.test(name)) {
		throw new Error(`Branch name contains invalid characters: ${name}`);
	}
	if (name.includes('..')) throw new Error('Branch name cannot contain ".."');
	if (name.includes('@{')) throw new Error('Branch name cannot contain "@{"');
	if (name.includes('//')) throw new Error('Branch name cannot contain "//"');
	if (name.startsWith('/') || name.endsWith('/')) {
		throw new Error('Branch name cannot start or end with "/"');
	}
	if (name.startsWith('-')) throw new Error('Branch name cannot start with "-"');
	if (name.startsWith('.') || name.endsWith('.')) {
		throw new Error('Branch name cannot start or end with "."');
	}
	if (name.endsWith('.lock')) throw new Error('Branch name cannot end with ".lock"');
	if (name === '@') throw new Error('Branch name cannot be "@"');
}

export function generateProjectSlug(filePath: string, existingProjectSlugs: Set<string>): string {
	const parsed = path.parse(filePath);
	const name = toSlugSegment(parsed.base) || 'project';
	if (!existingProjectSlugs.has(name)) return name;

	const parentName = parsed.dir ? toSlugSegment(path.basename(parsed.dir)) : '';
	const base = parentName ? `${parentName}-${name}` : name;
	if (!existingProjectSlugs.has(base)) return base;

	let i = 2;
	while (existingProjectSlugs.has(`${base}-${i}`)) i++;
	return `${base}-${i}`;
}

export class ProjectRegistry {
	constructor(
		private paths: ConfigPaths,
		private configRepo = new ConfigRepository(),
		private appConfig = new AppConfigStore(paths, configRepo),
	) {}

	getDefaultProjectSlug(): string | null {
		const config = this.appConfig.read();
		const lastProjectSlug = config.lastUsedProjectSlug;
		if (lastProjectSlug && config.projects.some((p) => p.projectSlug === lastProjectSlug)) {
			return lastProjectSlug;
		}
		if (config.projects.length > 0) {
			return config.projects[0].projectSlug;
		}
		return null;
	}

	listProjects(): ProjectInfo[] {
		return this.appConfig.read().projects.map((entry) => entryToInfo(entry, this.configRepo));
	}

	hasProject(projectSlug: string): boolean {
		return this.appConfig.read().projects.some((p) => p.projectSlug === projectSlug);
	}

	getTicketsPath(projectSlug: string): string | undefined {
		return this.appConfig.read().projects.find((p) => p.projectSlug === projectSlug)?.ticketsPath;
	}

	getBoardId(projectSlug: string): string | undefined {
		return this.appConfig.read().projects.find((p) => p.projectSlug === projectSlug)?.boardId;
	}

	previewSlug(projectPath: string): string {
		const existing = new Set(this.appConfig.read().projects.map((p) => p.projectSlug));
		return generateProjectSlug(projectPath, existing);
	}

	addProject(
		projectPath: string,
		opts: Omit<Partial<ProjectEntry>, 'path'> = {},
	): ProjectInfo {
		if (!this.configRepo.exists(projectPath)) {
			throw new Error(`Path does not exist: ${projectPath}`);
		}
		if (!this.configRepo.exists(path.join(projectPath, '.git'))) {
			throw new Error(`Not a git repository: ${projectPath}`);
		}
		if (opts.branch !== undefined) {
			validateBranchName(opts.branch);
		}
		if (opts.mainBranch !== undefined) {
			validateBranchName(opts.mainBranch);
		}

		const config = this.appConfig.read();
		const canonicalPath = this.configRepo.realpathSync(projectPath);
		const alreadyRegistered = config.projects.some((p) => {
			try {
				return this.configRepo.realpathSync(p.path) === canonicalPath;
			} catch {
				return false;
			}
		});
		if (alreadyRegistered) {
			throw new Error(`Project already registered: ${projectPath}`);
		}

		const existingProjectSlugs = new Set(config.projects.map((p) => p.projectSlug));
		const finalProjectSlug = opts.projectSlug ?? generateProjectSlug(projectPath, existingProjectSlugs);
		if (existingProjectSlugs.has(finalProjectSlug)) {
			throw new Error(`Project slug already exists: ${finalProjectSlug}`);
		}

		const { projectSlug: _, ...optionalFields } = opts;
		const entry: ProjectEntry = {
			path: canonicalPath,
			projectSlug: finalProjectSlug,
			...Object.fromEntries(
				Object.entries(optionalFields).filter(([, v]) => v !== undefined),
			),
		};
		this.appConfig.write({
			...config,
			projects: [...config.projects, entry],
			lastUsedProjectSlug: finalProjectSlug,
		});

		return entryToInfo(entry, this.configRepo);
	}

	updateProject(projectSlug: string, newPath?: string, newProjectSlug?: string): ProjectInfo {
		const config = this.appConfig.read();
		const index = config.projects.findIndex((p) => p.projectSlug === projectSlug);
		if (index < 0) throw new Error(`Project not found: ${projectSlug}`);

		const entry = config.projects[index];
		if (newPath !== undefined) {
			if (!newPath || !this.configRepo.exists(newPath)) {
				throw new Error(`Path does not exist: ${newPath}`);
			}
			if (!this.configRepo.exists(path.join(newPath, '.git'))) {
				throw new Error(`Not a git repository: ${newPath}`);
			}
		}
		const updatedPath = newPath !== undefined ? this.configRepo.realpathSync(newPath) : entry.path;
		const updatedProjectSlug = newProjectSlug ?? entry.projectSlug;

		if (newProjectSlug && newProjectSlug !== projectSlug) {
			const otherProjectSlugs = new Set(
				config.projects.filter((_, i) => i !== index).map((p) => p.projectSlug)
			);
			if (otherProjectSlugs.has(updatedProjectSlug)) {
				throw new Error(`Project slug already exists: ${updatedProjectSlug}`);
			}
		}

		const updated: ProjectEntry = { ...entry, path: updatedPath, projectSlug: updatedProjectSlug };
		const newProjects = config.projects.map((p, i) => (i === index ? updated : p));
		const newLastUsed = config.lastUsedProjectSlug === projectSlug
			? updatedProjectSlug : config.lastUsedProjectSlug;
		this.appConfig.write({ ...config, projects: newProjects, lastUsedProjectSlug: newLastUsed });

		return entryToInfo(updated, this.configRepo);
	}

	removeProject(projectSlug: string): void {
		const config = this.appConfig.read();
		const newProjects = config.projects.filter((p) => p.projectSlug !== projectSlug);
		const newLastUsed = config.lastUsedProjectSlug === projectSlug
			? (newProjects[0]?.projectSlug ?? null)
			: config.lastUsedProjectSlug;
		this.appConfig.write({ ...config, projects: newProjects, lastUsedProjectSlug: newLastUsed });

		const projectConfigDir = this.paths.projectConfigDir(projectSlug);
		if (fs.existsSync(projectConfigDir)) {
			fs.rmSync(projectConfigDir, { recursive: true });
		}
	}

	setLastUsed(projectSlug: string): void {
		const config = this.appConfig.read();
		if (config.projects.some((p) => p.projectSlug === projectSlug) && config.lastUsedProjectSlug !== projectSlug) {
			this.appConfig.write({ ...config, lastUsedProjectSlug: projectSlug });
		}
	}

	getName(projectSlug: string): string {
		const project = this.appConfig.read().projects.find((p) => p.projectSlug === projectSlug);
		return project?.name || projectSlug;
	}

	private updateProjectEntry(
		projectSlug: string,
		patch: (entry: ProjectEntry) => ProjectEntry,
	): void {
		const config = this.appConfig.read();
		const index = config.projects.findIndex((p) => p.projectSlug === projectSlug);
		if (index < 0) throw new Error(`Project not found: ${projectSlug}`);
		const newProjects = config.projects.map((p, i) => (i === index ? patch({ ...p }) : p));
		this.appConfig.write({ ...config, projects: newProjects });
	}

	setTicketsLocation(projectSlug: string, change: { kind: 'path' | 'branch'; value: string }): void {
		const value = change.value.trim();
		if (!value) throw new Error('Tickets folder and branch cannot be empty.');
		if (change.kind === 'branch') validateBranchName(value);
		else if (!path.isAbsolute(value)) throw new Error('Tickets folder must be an absolute path.');
		this.updateProjectEntry(projectSlug, (entry) => change.kind === 'path'
			? { ...entry, ticketsPath: value }
			: { ...entry, branch: value });
	}

	setBoardId(projectSlug: string, boardId: string | undefined): void {
		this.updateProjectEntry(projectSlug, (entry) => {
			if (boardId !== undefined) entry.boardId = boardId;
			else delete entry.boardId;
			return entry;
		});
	}

	getPort(): number {
		return this.appConfig.read().port ?? 14780;
	}

	getBrowser(): string {
		return this.appConfig.read().browser ?? 'chrome';
	}

	getLastUsedProfileName(): string | null {
		return this.appConfig.read().lastUsedProfileName;
	}

	setLastUsedProfileName(profileName: string): void {
		if (!profileName) throw new Error('profileName cannot be empty');
		const config = this.appConfig.read();
		if (config.lastUsedProfileName !== profileName) {
			this.appConfig.write({ ...config, lastUsedProfileName: profileName });
		}
	}
}
