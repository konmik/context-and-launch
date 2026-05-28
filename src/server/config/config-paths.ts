import fs from 'fs';
import path from 'path';
import os from 'os';

export class ConfigPaths {
	readonly baseDir: string;

	constructor(baseDir?: string) {
		this.baseDir = baseDir ?? path.join(os.homedir(), '.context-launch');
	}

	private requireSafeSlug(slug: string): void {
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

	appConfigDir(): string {
		return path.join(this.baseDir, 'config');
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

	platformScriptPs1(): string {
		return path.join(this.baseDir, 'config', 'run-agent.ps1');
	}

	platformScriptSh(): string {
		return path.join(this.baseDir, 'config', 'run-agent.sh');
	}

	projectDir(slug: string): string {
		this.requireSafeSlug(slug);
		return path.join(this.baseDir, 'projects', slug);
	}

	projectConfigDir(slug: string): string {
		this.requireSafeSlug(slug);
		return path.join(this.baseDir, 'projects', slug, 'config');
	}

	projectLauncherConfigFile(slug: string): string {
		this.requireSafeSlug(slug);
		return path.join(this.baseDir, 'projects', slug, 'config', 'launcher-config.json');
	}

	ticketWorktreeDir(slug: string): string {
		this.requireSafeSlug(slug);
		return path.join(this.baseDir, 'projects', slug, 'tickets');
	}

	agentWorktreeDir(slug: string): string {
		this.requireSafeSlug(slug);
		return path.join(this.baseDir, 'projects', slug, 'worktrees');
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
