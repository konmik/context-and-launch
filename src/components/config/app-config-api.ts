import { appConfigStore } from '~/core/config/instances.js';
import type { AppConfigData } from '~/core/config/app-config-data.js';
import { fail, succeed, type Result } from '~/util/result.js';
import { errorMessage } from '~/core/shared/errors.js';

export async function readAppConfig(owner?: string): Promise<Result<AppConfigData, string>> {
	'use server';
	try {
		return succeed(appConfigStore.read(owner));
	} catch (error) {
		return fail(errorMessage(error));
	}
}

export async function saveAppConfig(configJson: string, owner: string): Promise<Result<AppConfigData, string>> {
	'use server';
	try {
		return owner
			? succeed(appConfigStore.update(() => JSON.parse(configJson), owner))
			: fail('Configuration update requires a client identity.');
	} catch (error) {
		return fail(errorMessage(error));
	}
}

export async function releaseAppConfig(owner: string): Promise<void> {
	'use server';
	appConfigStore.release(owner);
}
