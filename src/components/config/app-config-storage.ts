import { createContext } from 'solid-js';
import type { AppConfigData } from '~/core/config/app-config-data.js';
import { readConfig, saveConfig } from './config-api.js';
import { createStoredSignal, type StoredSignal } from '~/util/stored-signal.js';

export const AppConfigContext = createContext<StoredSignal<AppConfigData>>();

export function createAppConfigStorage(): StoredSignal<AppConfigData> {
	return createStoredSignal(async () => {
		const result = await readConfig();
		if (result.type === 'Failure') throw new Error(result.error);
		return result.value;
	}, async transform => {
		const owner = crypto.randomUUID();
		const current = await readConfig(owner);
		if (current.type === 'Failure') return current;
		return saveConfig(transform(current.value), owner);
	});
}
