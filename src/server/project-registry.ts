import fs from 'fs';
import path from 'path';
import type { ConfigPaths } from './config-paths.js';

export interface ProjectInfo {
	path: string;
	slug: string;
	available: boolean;
}

export interface ProjectEntry {
	path: string;
	slug: string;
}

export interface ProjectConfig {
	projects: ProjectEntry[];
	lastUsedSlug: string | null;
	port?: number;
	browser?: string;
}

function isGitRepo(dirPath: string): boolean {
	try {
		return fs.existsSync(dirPath) && fs.existsSync(path.join(dirPath, '.git'));
	} catch {
		return false;
	}
}

function toSlugSegment(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
}

export function generateSlug(filePath: string, existingSlugs: Set<string>): string {
	const parsed = path.parse(filePath);
	const name = toSlugSegment(parsed.base) || 'project';
	if (!existingSlugs.has(name)) return name;

	const parentName = parsed.dir ? toSlugSegment(path.basename(parsed.dir)) : '';
	const base = parentName ? `${parentName}-${name}` : name;
	if (!existingSlugs.has(base)) return base;

	let i = 2;
	while (existingSlugs.has(`${base}-${i}`)) i++;
	return `${base}-${i}`;
}

export class ProjectRegistry {
	private paths: ConfigPaths;
	private cached: ProjectConfig | null = null;
	private extraFields: Record<string, unknown> = {};

	constructor(paths: ConfigPaths) {
		this.paths = paths;
	}

	private static emptyConfig(): ProjectConfig {
		return { projects: [], lastUsedSlug: null, port: undefined, browser: undefined };
	}

	private load(): ProjectConfig {
		if (this.cached) return this.cached;
		const configFile = this.paths.projectRegistryFile();
		if (!fs.existsSync(configFile)) {
			this.cached = ProjectRegistry.emptyConfig();
			this.extraFields = {};
			return this.cached;
		}
		try {
			const text = fs.readFileSync(configFile, 'utf-8');
			const raw = JSON.parse(text);
			if (!Array.isArray(raw.projects)) {
				this.cached = ProjectRegistry.emptyConfig();
				this.extraFields = {};
				return this.cached;
			}
			const { projects, lastUsedSlug, port, browser, ...extra } = raw;
			const config: ProjectConfig = {
				projects,
				lastUsedSlug: lastUsedSlug ?? null,
				port,
				browser,
			};
			this.cached = config;
			this.extraFields = extra;
			return config;
		} catch {
			this.cached = ProjectRegistry.emptyConfig();
			this.extraFields = {};
			return this.cached;
		}
	}

	private save(config: ProjectConfig): void {
		this.paths.writeConfigFile(
			this.paths.projectRegistryFile(),
			JSON.stringify({ ...this.extraFields, ...config }, null, 2)
		);
		this.cached = config;
	}

	getDefaultSlug(): string | null {
		const config = this.load();
		const lastSlug = config.lastUsedSlug;
		if (lastSlug && config.projects.some((p) => p.slug === lastSlug)) {
			return lastSlug;
		}
		if (config.projects.length > 0) {
			return config.projects[0].slug;
		}
		return null;
	}

	listProjects(): ProjectInfo[] {
		return this.load().projects.map((entry) => ({
			path: entry.path,
			slug: entry.slug,
			available: isGitRepo(entry.path)
		}));
	}

	addProject(projectPath: string, slug?: string): ProjectInfo {
		if (!fs.existsSync(projectPath)) {
			throw new Error(`Path does not exist: ${projectPath}`);
		}
		if (!fs.existsSync(path.join(projectPath, '.git'))) {
			throw new Error(`Not a git repository: ${projectPath}`);
		}

		const config = this.load();
		const canonicalPath = fs.realpathSync(projectPath);
		const alreadyRegistered = config.projects.some((p) => {
			try {
				return fs.realpathSync(p.path) === canonicalPath;
			} catch {
				return false;
			}
		});
		if (alreadyRegistered) {
			throw new Error(`Project already registered: ${projectPath}`);
		}

		const existingSlugs = new Set(config.projects.map((p) => p.slug));
		const finalSlug = slug ?? generateSlug(projectPath, existingSlugs);
		if (existingSlugs.has(finalSlug)) {
			throw new Error(`Slug already exists: ${finalSlug}`);
		}

		const entry: ProjectEntry = { path: canonicalPath, slug: finalSlug };
		this.save({
			...config,
			projects: [...config.projects, entry],
			lastUsedSlug: finalSlug
		});

		return { path: entry.path, slug: entry.slug, available: true };
	}

	updateProject(slug: string, newPath?: string, newSlug?: string): ProjectInfo {
		const config = this.load();
		const index = config.projects.findIndex((p) => p.slug === slug);
		if (index < 0) throw new Error(`Project not found: ${slug}`);

		const entry = config.projects[index];
		const updatedPath = newPath ? fs.realpathSync(newPath) : entry.path;
		const updatedSlug = newSlug ?? entry.slug;

		if (newSlug && newSlug !== slug) {
			const otherSlugs = new Set(
				config.projects.filter((_, i) => i !== index).map((p) => p.slug)
			);
			if (otherSlugs.has(updatedSlug)) {
				throw new Error(`Slug already exists: ${updatedSlug}`);
			}
		}

		const updated: ProjectEntry = { path: updatedPath, slug: updatedSlug };
		const newProjects = config.projects.map((p, i) => (i === index ? updated : p));
		const newLastUsed = config.lastUsedSlug === slug ? updatedSlug : config.lastUsedSlug;
		this.save({ ...config, projects: newProjects, lastUsedSlug: newLastUsed });

		return {
			path: updatedPath,
			slug: updatedSlug,
			available: isGitRepo(updatedPath)
		};
	}

	removeProject(slug: string): void {
		const config = this.load();
		const newProjects = config.projects.filter((p) => p.slug !== slug);
		const newLastUsed =
			config.lastUsedSlug === slug ? (newProjects[0]?.slug ?? null) : config.lastUsedSlug;
		this.save({ ...config, projects: newProjects, lastUsedSlug: newLastUsed });
	}

	setLastUsed(slug: string): void {
		const config = this.load();
		if (config.projects.some((p) => p.slug === slug) && config.lastUsedSlug !== slug) {
			this.save({ ...config, lastUsedSlug: slug });
		}
	}

	getPort(): number {
		return this.load().port ?? 14780;
	}

	getBrowser(): string {
		return this.load().browser ?? 'chrome';
	}
}
