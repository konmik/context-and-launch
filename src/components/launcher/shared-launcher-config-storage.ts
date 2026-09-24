import { createContext } from 'solid-js';
import type { LauncherConfig } from '~/core/launcher/launcher-config-data.js';
import { createStoredSignal, type StoredSignal } from '~/util/stored-signal.js';
import { transformConfig } from '~/util/transform-config.js';
import {
	readSharedLauncherConfig, saveSharedLauncherConfig, releaseSharedLauncherConfig,
} from './shared-launcher-config-api.js';

export const LauncherConfigContext = createContext<StoredSignal<LauncherConfig>>();

export function createSharedLauncherConfigStorage(): StoredSignal<LauncherConfig> {
	return createStoredSignal(async () => {
		const result = await readSharedLauncherConfig();
		if (result.type === 'Failure') throw new Error(result.error);
		return result.value;
	}, transform => transformConfig(
		transform, readSharedLauncherConfig, saveSharedLauncherConfig, releaseSharedLauncherConfig,
	));
}
