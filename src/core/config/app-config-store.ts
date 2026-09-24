import type { ConfigPaths } from './config-paths.js';
import { ConfigRepository } from './config-repository.js';
import { decodeAppConfig, type AppConfigData } from './app-config-data.js';
import { UpdateLock } from '~/util/update-lock.js';
import type { Updater } from '~/util/updater.js';

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
			const { config, legacy } = decodeAppConfig(raw);
			if (legacy) this.lock.write(() => this.repository.writeJson(file, config));
			return config;
		}, owner);
	}

	update(transform: Updater<AppConfigData>, owner?: string): AppConfigData {
		return this.lock.write(() => {
			const { config: next } = decodeAppConfig(transform(this.read()));
			this.repository.writeJson(this.paths.projectRegistryFile(), next);
			return next;
		}, owner);
	}

	release(owner: string): void { this.lock.release(owner); }
}
