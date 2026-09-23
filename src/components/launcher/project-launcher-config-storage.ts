import { revalidate } from '@solidjs/router';
import type { LauncherConfig } from '~/core/launcher/launcher-config-data.js';
import type { Updater } from '~/util/updater.js';
import type { Result } from '~/util/result.js';
import { transformConfig } from '~/util/transform-config.js';
import {
	getProjectLauncherConfig, readProjectLauncherConfig, saveProjectLauncherConfig, releaseProjectLauncherConfig,
} from './launcher-api.js';

const pending = new Map<string, Promise<Result<LauncherConfig, string>>>();

export function updateProjectLauncherConfig(projectSlug: string, transform: Updater<LauncherConfig>) {
	const operation = (pending.get(projectSlug) ?? Promise.resolve()).then(async () => {
		const result = await transformConfig(
			transform,
			owner => readProjectLauncherConfig(projectSlug, owner),
			(json, owner) => saveProjectLauncherConfig(projectSlug, json, owner),
			owner => releaseProjectLauncherConfig(projectSlug, owner),
		);
		if (result.type === 'Success') revalidate(getProjectLauncherConfig.keyFor(projectSlug));
		return result;
	});
	pending.set(projectSlug, operation);
	void operation.then(() => {
		if (pending.get(projectSlug) === operation) pending.delete(projectSlug);
	});
	return operation;
}
