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

		const canonicalPath = this.configRepo.realpathSync(projectPath);
		const saved = this.appConfig.update(config => {
			const alreadyRegistered = config.projects.some(project => {
				try {
					return this.configRepo.realpathSync(project.path) === canonicalPath;
				} catch {
					return false;
				}
			});
			if (alreadyRegistered) throw new Error(`Project already registered: ${projectPath}`);
			const existingProjectSlugs = new Set(config.projects.map(project => project.projectSlug));
			const projectSlug = opts.projectSlug ?? generateProjectSlug(projectPath, existingProjectSlugs);
			if (existingProjectSlugs.has(projectSlug)) throw new Error(`Project slug already exists: ${projectSlug}`);
			return {
				...config,
				projects: [...config.projects, { ...opts, path: canonicalPath, projectSlug }],
				lastUsedProjectSlug: projectSlug,
			};
		});

		return entryToInfo(saved.projects.at(-1)!, this.configRepo);
	}

	updateProject(projectSlug: string, newPath?: string, newProjectSlug?: string): ProjectInfo {
		const updatedProjectSlug = newProjectSlug ?? projectSlug;
		const saved = this.appConfig.update(config => {
			const index = config.projects.findIndex(project => project.projectSlug === projectSlug);
			if (index < 0) throw new Error(`Project not found: ${projectSlug}`);
			const entry = config.projects[index];
			if (newPath !== undefined) {
				if (!newPath || !this.configRepo.exists(newPath)) throw new Error(`Path does not exist: ${newPath}`);
				if (!this.configRepo.exists(path.join(newPath, '.git'))) {
					throw new Error(`Not a git repository: ${newPath}`);
				}
			}
			if (newProjectSlug && config.projects.some((project, i) =>
				i !== index && project.projectSlug === newProjectSlug)) {
				throw new Error(`Project slug already exists: ${newProjectSlug}`);
			}
			const updated = {
				...entry, projectSlug: updatedProjectSlug,
				path: newPath === undefined ? entry.path : this.configRepo.realpathSync(newPath),
			};
			return {
				...config,
				projects: config.projects.map((project, i) => i === index ? updated : project),
				lastUsedProjectSlug: config.lastUsedProjectSlug === projectSlug
					? updatedProjectSlug : config.lastUsedProjectSlug,
			};
		});
		const updated = saved.projects.find(project => project.projectSlug === updatedProjectSlug)!;
		return entryToInfo(updated, this.configRepo);
	}

	removeProject(projectSlug: string): void {
		this.appConfig.update(config => {
			const projects = config.projects.filter(project => project.projectSlug !== projectSlug);
			return { ...config, projects, lastUsedProjectSlug: config.lastUsedProjectSlug === projectSlug
				? projects[0]?.projectSlug ?? null : config.lastUsedProjectSlug };
		});

		const projectConfigDir = this.paths.projectConfigDir(projectSlug);
		if (fs.existsSync(projectConfigDir)) {
			fs.rmSync(projectConfigDir, { recursive: true });
		}
	}

	getName(projectSlug: string): string {
		const project = this.appConfig.read().projects.find((p) => p.projectSlug === projectSlug);
		return project?.name || projectSlug;
	}

	setTicketsLocation(projectSlug: string, change: { kind: 'path' | 'branch'; value: string }): void {
		const value = change.value.trim();
		if (!value) throw new Error('Tickets folder and branch cannot be empty.');
		if (change.kind === 'branch') validateBranchName(value);
		else if (!path.isAbsolute(value)) throw new Error('Tickets folder must be an absolute path.');
		this.appConfig.update(config => {
			if (!config.projects.some(project => project.projectSlug === projectSlug)) {
				throw new Error(`Project not found: ${projectSlug}`);
			}
			return { ...config, projects: config.projects.map(project => project.projectSlug !== projectSlug ? project
				: { ...project, [change.kind === 'path' ? 'ticketsPath' : 'branch']: value }) };
		});
	}

	getPort(): number {
		return this.appConfig.read().port ?? 14780;
	}

	getBrowser(): string {
		return this.appConfig.read().browser ?? 'chrome';
	}
}
