import path from 'path';
import type { ConfigPaths } from '../config/config-paths.js';
import { ConfigRepository } from '../config/config-repository.js';
import { SharedLauncherConfigStore } from './shared-launcher-config-store.js';
import {
	decodeLauncherConfig, mergeLauncherConfigs,
	type LauncherConfig,
} from './launcher-config-data.js';
import { UpdateLock } from '~/util/update-lock.js';
import type { Updater } from '~/util/updater.js';
export * from './launcher-config-data.js';

export class LauncherConfigManager {
	private readonly projectLocks = new Map<string, UpdateLock>();

	private projectLock(projectSlug: string): UpdateLock {
		let lock = this.projectLocks.get(projectSlug);
		if (!lock) this.projectLocks.set(projectSlug, lock = new UpdateLock());
		return lock;
	}

	constructor(
		private paths: ConfigPaths,
		private configRepo = new ConfigRepository(),
		private sharedConfig = new SharedLauncherConfigStore(paths, configRepo),
	) {}

	getAppConfigDir(): string { return this.paths.appConfigDir(); }
	getConfigDefaultsDir(): string { return this.paths.configDefaults(); }
	getProjectDir(projectSlug: string): string { return this.paths.projectDir(projectSlug); }
	getAgentWorktreeDir(projectSlug: string): string { return this.paths.agentWorktreeDir(projectSlug); }

	resolveWorktreeSettings(projectSlug: string) {
		const config = this.loadProjectConfig(projectSlug);
		return {
			worktreeRootPath: config.worktreeRootPath || this.paths.agentWorktreeDir(projectSlug),
			branchPrefix: config.branchPrefix,
		};
	}

	loadAppConfig(): LauncherConfig { return this.sharedConfig.read(); }
	saveAppConfig(config: LauncherConfig): void { this.sharedConfig.write(config); }

	loadProjectConfig(projectSlug: string, owner?: string): LauncherConfig {
		return this.projectLock(projectSlug).read(() => this.readProjectConfig(projectSlug), owner);
	}

	releaseProjectConfig(projectSlug: string, owner: string): void {
		this.projectLock(projectSlug).release(owner);
	}

	private readProjectConfig(projectSlug: string): LauncherConfig {
		const raw = this.configRepo.readJson(this.paths.projectLauncherConfigFile(projectSlug));
		if (raw !== null) return decodeLauncherConfig(raw);
		const file = path.join(this.paths.configDefaults(), 'project-launcher-config.json');
		const defaults = this.configRepo.readJson(file);
		if (defaults === null) throw new Error(`Default project launcher config not found: ${file}`);
		return decodeLauncherConfig(defaults);
	}

	saveProjectConfig(projectSlug: string, config: LauncherConfig, owner?: string): LauncherConfig {
		return this.projectLock(projectSlug).write(() => {
			const next = decodeLauncherConfig(config);
			this.configRepo.writeJson(this.paths.projectLauncherConfigFile(projectSlug), next);
			return next;
		}, owner);
	}

	getMergedConfig(projectSlug: string) {
		return mergeLauncherConfigs(this.sharedConfig.read(), this.loadProjectConfig(projectSlug));
	}

	updateProjectConfig(projectSlug: string, transform: Updater<LauncherConfig>): LauncherConfig {
		return this.projectLock(projectSlug).write(() => {
			const next = decodeLauncherConfig(transform(this.readProjectConfig(projectSlug)));
			this.configRepo.writeJson(this.paths.projectLauncherConfigFile(projectSlug), next);
			return next;
		});
	}
}
