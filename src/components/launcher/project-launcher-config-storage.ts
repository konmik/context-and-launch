import { createContext, createMemo } from 'solid-js';
import type { LauncherConfig } from '~/core/launcher/launcher-config-data.js';
import { createStoredSignal, type StoredSignal } from '~/util/stored-signal.js';
import { transformConfig } from '~/util/transform-config.js';
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
		return createStoredSignal(async () => {
			const result = await persistence.read(slug);
			if (result.type === 'Failure') throw new Error(result.error);
			return result.value;
		}, transform => transformConfig(
			transform,
			owner => persistence.read(slug, owner),
			(json, owner) => persistence.save(slug, json, owner),
			owner => persistence.release(slug, owner),
		));
	});
	return {
		get: () => project().get(),
		update: transform => project().update(transform),
		refresh: () => project().refresh(),
	};
}
