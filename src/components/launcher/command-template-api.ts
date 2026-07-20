import { query } from '@solidjs/router';
import { commandTemplateService } from '~/core/config/instances.js';
import { errorResult } from '~/core/shared/errors.js';
import type { CommandTemplateFeatureGroup } from '~/core/command-template/command-template-types.js';
import type { CommandTemplateKey } from '~/core/command-template/command-template-definitions.js';

export interface CommandTemplateView {
	key: CommandTemplateKey;
	label: string;
	featureGroup: CommandTemplateFeatureGroup;
	script: string;
	isOverridden: boolean;
	knownPlaceholders: string[];
}

function toView(entry: ReturnType<typeof commandTemplateService.get>): CommandTemplateView {
	return {
		key: entry.key,
		label: entry.label,
		featureGroup: entry.featureGroup,
		script: entry.script,
		isOverridden: entry.isOverridden,
		knownPlaceholders: [...entry.scalarPlaceholders, ...entry.listPlaceholders],
	};
}

export const getCommandTemplates = query(async (): Promise<CommandTemplateView[]> => {
	'use server';
	return commandTemplateService.entriesForCurrentPlatform().map(toView);
}, 'command-templates');

export async function saveCommandTemplate(key: CommandTemplateKey, script: string) {
	'use server';
	try {
		return { ok: true as const, entry: toView(commandTemplateService.save(key, script)) };
	} catch (error) {
		return errorResult(error);
	}
}

export async function resetCommandTemplate(key: CommandTemplateKey) {
	'use server';
	try {
		return { ok: true as const, entry: toView(commandTemplateService.reset(key)) };
	} catch (error) {
		return errorResult(error);
	}
}
