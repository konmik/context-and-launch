import { createContext, createMemo } from 'solid-js';
import type { LauncherConfig } from '~/core/launcher/launcher-config-data.js';
import { createStoredSignal, type StoredSignal } from '~/util/stored-signal.js';
import { transformConfig } from '~/util/transform-config.js';
import {
	readProjectLauncherConfig, saveProjectLauncherConfig, releaseProjectLauncherConfig,
} from './launcher-api.js';

export const ProjectLauncherConfigContext = createContext<StoredSignal<LauncherConfig>>();

export function createProjectLauncherConfigStorage(projectSlug: string): StoredSignal<LauncherConfig> {
	const initial = createMemo(async () => {
		const result = await readProjectLauncherConfig(projectSlug);
		if (result.type === 'Failure') throw new Error(result.error);
		return result.value;
	});
	return createStoredSignal(initial, transform => transformConfig(
		transform,
		owner => readProjectLauncherConfig(projectSlug, owner),
		(json, owner) => saveProjectLauncherConfig(projectSlug, json, owner),
		owner => releaseProjectLauncherConfig(projectSlug, owner),
	));
}
