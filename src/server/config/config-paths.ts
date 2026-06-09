import fs from 'fs';
import path from 'path';
import os from 'os';

export function requireSafeSlug(slug: string): void {
	if (
		slug === '.' ||
		slug === '..' ||
		slug.includes('/') ||
		slug.includes('\\') ||
		slug.includes('\0')
	) {
		throw new Error(`Invalid slug: ${slug}`);
	}
}

export class ConfigPaths {
	readonly baseDir: string;
	readonly configDefaultsDir: string;

	constructor(baseDir?: string, configDefaultsDir?: string) {
		this.baseDir = baseDir ?? path.join(os.homedir(), '.context-launch');
		this.configDefaultsDir = configDefaultsDir ?? path.join(process.cwd(), 'config-defaults');
	}

	appConfigDir(): string {
		return path.join(this.baseDir, 'config');
	}

	configDefaults(): string {
		return this.configDefaultsDir;
	}

	projectRegistryFile(): string {
		return path.join(this.baseDir, 'config', 'config.json');
	}

	appLauncherConfigFile(): string {
		return path.join(this.baseDir, 'config', 'launcher-config.json');
	}

	boardsFile(): string {
		return path.join(this.baseDir, 'config', 'boards.json');
	}

	projectDir(projectSlug: string): string {
		requireSafeSlug(projectSlug);
		return path.join(this.baseDir, 'projects', projectSlug);
	}

	projectConfigDir(projectSlug: string): string {
		requireSafeSlug(projectSlug);
		return path.join(this.baseDir, 'projects', projectSlug, 'config');
	}

	projectLauncherConfigFile(projectSlug: string): string {
		requireSafeSlug(projectSlug);
		return path.join(this.baseDir, 'projects', projectSlug, 'config', 'launcher-config.json');
	}

	ticketWorktreeDir(projectSlug: string): string {
		requireSafeSlug(projectSlug);
		return path.join(this.baseDir, 'projects', projectSlug, 'tickets');
	}

	agentWorktreeDir(projectSlug: string): string {
		requireSafeSlug(projectSlug);
		return path.join(this.baseDir, 'projects', projectSlug, 'worktrees');
	}

	readConfigFile(filePath: string): string | null {
		if (!fs.existsSync(filePath)) return null;
		return fs.readFileSync(filePath, 'utf-8');
	}

	writeConfigFile(filePath: string, content: string): void {
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, content);
	}
}
