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
		const projectSlug = props.projectSlug;
		return createStoredConfig(
			persistence.read.bind(persistence, projectSlug),
			persistence.save.bind(persistence, projectSlug),
			persistence.release.bind(persistence, projectSlug),
		);
	});
	return {
		get: () => project().get(),
		update: transform => project().update(transform),
		refresh: () => project().refresh(),
	};
}
