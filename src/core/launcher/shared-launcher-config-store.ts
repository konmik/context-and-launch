import type { ConfigPaths } from '../config/config-paths.js';
import { ConfigRepository } from '../config/config-repository.js';
import { UpdateLock } from '~/util/update-lock.js';
import { decodeLauncherConfig, type LauncherConfig } from './launcher-config-data.js';

export class SharedLauncherConfigStore {
	constructor(
		private readonly paths: ConfigPaths,
		private readonly repository = new ConfigRepository(),
		private readonly lock = new UpdateLock(),
	) {}

	read(owner?: string): LauncherConfig {
		return this.lock.read(() => {
			const file = this.paths.appLauncherConfigFile();
			const raw = this.repository.readJson(file);
			if (raw === null) throw new Error(`App launcher config not found: ${file}`);
			return decodeLauncherConfig(raw);
		}, owner);
	}

	release(owner: string): void { this.lock.release(owner); }

	write(config: LauncherConfig, owner?: string): LauncherConfig {
		return this.lock.write(() => {
			const next = decodeLauncherConfig(config);
			this.repository.writeJson(this.paths.appLauncherConfigFile(), next);
			return next;
		}, owner);
	}
}
