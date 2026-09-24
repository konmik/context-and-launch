import { createContext } from 'solid-js';
import type { LauncherConfig } from '~/core/launcher/launcher-config-data.js';
import type { StoredSignal } from '~/util/stored-signal.js';
import { createStoredConfig } from '~/util/stored-config.js';
import {
	readSharedLauncherConfig, saveSharedLauncherConfig, releaseSharedLauncherConfig,
} from './shared-launcher-config-api.js';

export const LauncherConfigContext = createContext<StoredSignal<LauncherConfig>>();

export function createSharedLauncherConfigStorage(): StoredSignal<LauncherConfig> {
	return createStoredConfig(readSharedLauncherConfig, saveSharedLauncherConfig, releaseSharedLauncherConfig);
}
