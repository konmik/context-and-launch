import { appConfigStore } from '~/core/config/instances.js';
import type { AppConfigData } from '~/core/config/app-config-data.js';
import { fail, succeed, type Result } from '~/util/result.js';
import { errorMessage } from '~/core/shared/errors.js';

export async function readConfig(owner?: string): Promise<Result<AppConfigData, string>> {
	'use server';
	try {
		return succeed(appConfigStore.read(owner));
	} catch (error) {
		return fail(errorMessage(error));
	}
}

export async function saveConfig(config: AppConfigData, owner: string): Promise<Result<AppConfigData, string>> {
	'use server';
	try {
		return owner
			? succeed(appConfigStore.write(config, owner))
			: fail('Configuration update requires a client identity.');
	} catch (error) {
		return fail(errorMessage(error));
	}
}
