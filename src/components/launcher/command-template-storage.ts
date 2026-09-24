import { createContext } from 'solid-js';
import type { CommandTemplateOverrides } from '~/core/command-template/command-template-types.js';
import type { StoredSignal } from '~/util/stored-signal.js';
import { createStoredConfig } from '~/util/stored-config.js';
import { readCommandTemplates, saveCommandTemplates, releaseCommandTemplates } from './command-template-api.js';

export const CommandTemplateContext = createContext<StoredSignal<CommandTemplateOverrides>>();

export function createCommandTemplateStorage(): StoredSignal<CommandTemplateOverrides> {
	return createStoredConfig(readCommandTemplates, saveCommandTemplates, releaseCommandTemplates);
}
