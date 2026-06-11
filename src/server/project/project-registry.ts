import fs from 'fs';
import path from 'path';
import type { ConfigPaths } from '../config/config-paths.js';
import { ConfigRepository } from '../config/config-repository.js';

export interface ProjectInfo {
	path: string;
	projectSlug: string;
	available: boolean;
	name: string;
	branch?: string;
	ticketsPath?: string;
	mainBranch?: string;
	boardId?: string;
}

export interface ProjectEntry {
	path: string;
	projectSlug: string;
	name?: string;
	branch?: string;
	ticketsPath?: string;
	mainBranch?: string;
	boardId?: string;
}

export interface ProjectConfig {
	projects: ProjectEntry[];
	lastUsedProjectSlug: string | null;
	lastUsedProfileName: string | null;
	port?: number;
	browser?: string;
}

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
	private paths: ConfigPaths;
	private configRepo: ConfigRepository;
	private cached: ProjectConfig | null = null;
	private extraFields: Record<string, unknown> = {};

	constructor(paths: ConfigPaths, configRepo?: ConfigRepository) {
		this.paths = paths;
		this.configRepo = configRepo ?? new ConfigRepository();
	}

	private load(): ProjectConfig {
		if (this.cached) return this.cached;
		const configFile = this.paths.projectRegistryFile();
		const raw = this.configRepo.readJson(configFile) as Record<string, unknown> | null;
		if (raw === null) {
			throw new Error(`config.json not found: ${configFile}`);
		}
		if (!Array.isArray(raw.projects)) {
			throw new Error(
				`Invalid config.json: "projects" is not an array`
				+ ` (${configFile})`,
			);
		}
		const lastUsed = (raw.lastUsedProjectSlug ?? raw.lastUsedSlug ?? null) as string | null;
		const lastUsedProfileName = (raw.lastUsedProfileName ?? null) as string | null;
		const migratedProjects: ProjectEntry[] = raw.projects.map(
			(p: Record<string, unknown>) => {
				const projectSlug = (p.projectSlug ?? p.slug) as string;
				const entry: ProjectEntry = { path: p.path as string, projectSlug };
				if (p.name !== undefined) entry.name = p.name as string;
				if (p.branch !== undefined) entry.branch = p.branch as string;
				if (p.ticketsPath !== undefined) entry.ticketsPath = p.ticketsPath as string;
				if (p.mainBranch !== undefined) entry.mainBranch = p.mainBranch as string;
				if (p.boardId !== undefined) entry.boardId = p.boardId as string;
				return entry;
			},
		);
		const {
			projects: _, lastUsedProjectSlug: _a, lastUsedSlug: _b,
			lastUsedProfileName: _c, port, browser, ...extra
		} = raw;
		const config: ProjectConfig = {
			projects: migratedProjects,
			lastUsedProjectSlug: lastUsed,
			lastUsedProfileName,
			port: port as number | undefined,
			browser: browser as string | undefined,
		};
		this.cached = config;
		this.extraFields = extra;
		const hasLegacyKeys = raw.lastUsedSlug !== undefined
			|| raw.projects.some((p: Record<string, unknown>) => p.slug !== undefined);
		if (hasLegacyKeys) {
			this.save(config);
		}
		return config;
	}

	private currentExtraFields(): Record<string, unknown> {
		const raw = this.configRepo.readJson(this.paths.projectRegistryFile()) as
			| Record<string, unknown>
			| null;
		if (raw === null) return this.extraFields;
		const {
			projects: _, lastUsedProjectSlug: _a, lastUsedSlug: _b,
			lastUsedProfileName: _c, port: _d, browser: _e, ...extra
		} = raw;
		return extra;
	}

	private save(config: ProjectConfig): void {
		const extraFields = this.currentExtraFields();
		this.extraFields = extraFields;
		this.configRepo.writeJson(
			this.paths.projectRegistryFile(),
			{ ...extraFields, ...config },
		);
		this.cached = config;
	}

	getDefaultProjectSlug(): string | null {
		const config = this.load();
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
		return this.load().projects.map((entry) => entryToInfo(entry, this.configRepo));
	}

	hasProject(projectSlug: string): boolean {
		return this.load().projects.some((p) => p.projectSlug === projectSlug);
	}

	getTicketsPath(projectSlug: string): string | undefined {
		return this.load().projects.find((p) => p.projectSlug === projectSlug)?.ticketsPath;
	}

	getBoardId(projectSlug: string): string | undefined {
		return this.load().projects.find((p) => p.projectSlug === projectSlug)?.boardId;
	}

	previewSlug(projectPath: string): string {
		const existing = new Set(this.load().projects.map((p) => p.projectSlug));
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

		const config = this.load();
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
		this.save({
			...config,
			projects: [...config.projects, entry],
			lastUsedProjectSlug: finalProjectSlug,
		});

		return entryToInfo(entry, this.configRepo);
	}

	updateProject(projectSlug: string, newPath?: string, newProjectSlug?: string): ProjectInfo {
		const config = this.load();
		const index = config.projects.findIndex((p) => p.projectSlug === projectSlug);
		if (index < 0) throw new Error(`Project not found: ${projectSlug}`);

		const entry = config.projects[index];
		const updatedPath = newPath ? this.configRepo.realpathSync(newPath) : entry.path;
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
		this.save({ ...config, projects: newProjects, lastUsedProjectSlug: newLastUsed });

		return entryToInfo(updated, this.configRepo);
	}

	removeProject(projectSlug: string): void {
		const config = this.load();
		const newProjects = config.projects.filter((p) => p.projectSlug !== projectSlug);
		const newLastUsed = config.lastUsedProjectSlug === projectSlug
			? (newProjects[0]?.projectSlug ?? null)
			: config.lastUsedProjectSlug;
		this.save({ ...config, projects: newProjects, lastUsedProjectSlug: newLastUsed });

		const projectConfigDir = this.paths.projectConfigDir(projectSlug);
		if (fs.existsSync(projectConfigDir)) {
			fs.rmSync(projectConfigDir, { recursive: true });
		}
	}

	setLastUsed(projectSlug: string): void {
		const config = this.load();
		if (config.projects.some((p) => p.projectSlug === projectSlug) && config.lastUsedProjectSlug !== projectSlug) {
			this.save({ ...config, lastUsedProjectSlug: projectSlug });
		}
	}

	getName(projectSlug: string): string {
		const project = this.load().projects.find((p) => p.projectSlug === projectSlug);
		return project?.name || projectSlug;
	}

	private updateProjectEntry(
		projectSlug: string,
		patch: (entry: ProjectEntry) => ProjectEntry,
	): void {
		const config = this.load();
		const index = config.projects.findIndex((p) => p.projectSlug === projectSlug);
		if (index < 0) throw new Error(`Project not found: ${projectSlug}`);
		const newProjects = config.projects.map((p, i) => (i === index ? patch({ ...p }) : p));
		this.save({ ...config, projects: newProjects });
	}

	setName(projectSlug: string, name: string | undefined): void {
		this.updateProjectEntry(projectSlug, (entry) => {
			if (name !== undefined && name.trim()) entry.name = name.trim();
			else delete entry.name;
			return entry;
		});
	}

	setBoardId(projectSlug: string, boardId: string | undefined): void {
		this.updateProjectEntry(projectSlug, (entry) => {
			if (boardId !== undefined) entry.boardId = boardId;
			else delete entry.boardId;
			return entry;
		});
	}

	getPort(): number {
		return this.load().port ?? 14780;
	}

	getBrowser(): string {
		return this.load().browser ?? 'chrome';
	}

	getLastUsedProfileName(): string | null {
		return this.load().lastUsedProfileName;
	}

	setLastUsedProfileName(profileName: string): void {
		if (!profileName) throw new Error('profileName cannot be empty');
		const config = this.load();
		if (config.lastUsedProfileName !== profileName) {
			this.save({ ...config, lastUsedProfileName: profileName });
		}
	}
}
