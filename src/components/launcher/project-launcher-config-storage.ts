import { createContext, createMemo } from 'solid-js';
import type { LauncherConfig } from '~/core/launcher/launcher-config-data.js';
import type { StoredSignal } from '~/util/stored-signal.js';
import { createStoredConfig } from '~/util/stored-config.js';
import {
	readProjectLauncherConfig, saveProjectLauncherConfig, releaseProjectLauncherConfig,
} from './launcher-api.js';

export const ProjectLauncherConfigContext = createContext<StoredSignal<LauncherConfig>>();

export function createProjectLauncherConfigStorage(props: { projectSlug: string }, persistence = {
	read: readProjectLauncherConfig,
	save: saveProjectLauncherConfig,
	release: releaseProjectLauncherConfig,
}): StoredSignal<LauncherConfig> {
	const project = createMemo(() => {
		const slug = props.projectSlug;
		return createStoredConfig(
			owner => persistence.read(slug, owner),
			(json, owner) => persistence.save(slug, json, owner),
			owner => persistence.release(slug, owner),
		);
	});
	return {
		get: () => project().get(),
		update: transform => project().update(transform),
		refresh: () => project().refresh(),
	};
}
