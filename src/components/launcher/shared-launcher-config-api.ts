import { sharedLauncherConfigStore } from '~/core/config/instances.js';
import type { LauncherConfig } from '~/core/launcher/launcher-config-data.js';
import { fail, succeed, type Result } from '~/util/result.js';
import { errorMessage } from '~/core/shared/errors.js';

export async function readSharedLauncherConfig(owner?: string): Promise<Result<LauncherConfig, string>> {
	'use server';
	try { return succeed(sharedLauncherConfigStore.read(owner)); }
	catch (error) { return fail(errorMessage(error)); }
}

export async function releaseSharedLauncherConfig(owner: string): Promise<void> {
	'use server';
	sharedLauncherConfigStore.release(owner);
}

export async function saveSharedLauncherConfig(
	json: string, owner: string,
): Promise<Result<LauncherConfig, string>> {
	'use server';
	try {
		return owner ? succeed(sharedLauncherConfigStore.write(JSON.parse(json), owner))
			: fail('Configuration update requires a client identity.');
	} catch (error) { return fail(errorMessage(error)); }
}
