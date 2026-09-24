import { createContext } from 'solid-js';
import type { AppConfigData } from '~/core/config/app-config-data.js';
import { readAppConfig, saveAppConfig, releaseAppConfig } from './app-config-api.js';
import type { StoredSignal } from '~/util/stored-signal.js';
import { createStoredConfig } from '~/util/stored-config.js';

export const AppConfigContext = createContext<StoredSignal<AppConfigData>>();

export function createAppConfigStorage(): StoredSignal<AppConfigData> {
	return createStoredConfig(readAppConfig, saveAppConfig, releaseAppConfig);
}
