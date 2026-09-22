import type { ConfigPaths } from './config-paths.js';
import { ConfigRepository } from './config-repository.js';
import { decodeAppConfig, hasLegacyConfigKeys, type AppConfigData } from './app-config-data.js';
import { UpdateLock } from '~/util/update-lock.js';

export class AppConfigStore {
	constructor(
		private readonly paths: ConfigPaths,
		private readonly repository = new ConfigRepository(),
		private readonly lock = new UpdateLock(),
	) {}

	read(owner?: string): AppConfigData {
		return this.lock.read(() => {
			const file = this.paths.projectRegistryFile();
			const raw = this.repository.readJson(file);
			if (raw === null) throw new Error(`config.json not found: ${file}`);
			const config = decodeAppConfig(raw);
			if (hasLegacyConfigKeys(raw)) this.write(config);
			return config;
		}, owner);
	}

	write(config: AppConfigData, owner?: string): AppConfigData {
		return this.lock.write(() => {
			const next = decodeAppConfig(config);
			this.repository.writeJson(this.paths.projectRegistryFile(), next);
			return next;
		}, owner);
	}
}
