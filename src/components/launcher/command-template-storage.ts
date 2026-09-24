import { createContext } from 'solid-js';
import type { CommandTemplateOverrides } from '~/core/command-template/command-template-types.js';
import { createStoredSignal, type StoredSignal } from '~/util/stored-signal.js';
import { transformConfig } from '~/util/transform-config.js';
import { readCommandTemplates, saveCommandTemplates, releaseCommandTemplates } from './command-template-api.js';

export const CommandTemplateContext = createContext<StoredSignal<CommandTemplateOverrides>>();

export function createCommandTemplateStorage(): StoredSignal<CommandTemplateOverrides> {
	return createStoredSignal(async () => {
		const result = await readCommandTemplates();
		if (result.type === 'Failure') throw new Error(result.error);
		return result.value;
	}, transform =>
		transformConfig(transform, readCommandTemplates, saveCommandTemplates, releaseCommandTemplates));
}
