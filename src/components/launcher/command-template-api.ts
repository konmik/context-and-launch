import { commandTemplateStore } from '~/core/config/instances.js';
import { errorMessage } from '~/core/shared/errors.js';
import { COMMAND_TEMPLATE_DEFINITIONS } from '~/core/command-template/command-template-definitions.js';
import {
	currentCommandTemplatePlatform, type CommandTemplateOverrides,
} from '~/core/command-template/command-template-types.js';
import { fail, succeed, type Result } from '~/util/result.js';

export async function getCommandTemplateDefinitions() {
	'use server';
	return COMMAND_TEMPLATE_DEFINITIONS.filter(entry => entry.platforms.includes(currentCommandTemplatePlatform()));
}

export async function readCommandTemplates(owner?: string): Promise<Result<CommandTemplateOverrides, string>> {
	'use server';
	try { return succeed(commandTemplateStore.read(owner)); }
	catch (error) { return fail(errorMessage(error)); }
}

export async function saveCommandTemplates(
	json: string, owner: string,
): Promise<Result<CommandTemplateOverrides, string>> {
	'use server';
	try {
		if (!owner) return fail('Configuration update requires a client identity.');
		return succeed(commandTemplateStore.write(JSON.parse(json), owner));
	} catch (error) { return fail(errorMessage(error)); }
}

export async function releaseCommandTemplates(owner: string): Promise<void> {
	'use server';
	commandTemplateStore.release(owner);
}
