import * as v from 'valibot';
import type { ConfigPaths } from '../config/config-paths.js';
import type { ConfigRepository } from '../config/config-repository.js';
import { COMMAND_TEMPLATE_DEFINITION_BY_KEY, COMMAND_TEMPLATE_DEFAULTS } from './command-template-definitions.js';
import type { CommandTemplateKey } from './command-template-definitions.js';
import { undeclaredPlaceholders } from './command-template-interpolation.js';
import type { CommandTemplateEntry, CommandTemplateOverrides } from './command-template-types.js';
import { UpdateLock } from '~/util/update-lock.js';
import type { JsonValue } from '../shared/json.js';

function validateOverrides(value: JsonValue): CommandTemplateOverrides {
	if (Array.isArray(value)) throw new Error('Command Template overrides must be a JSON object.');
	const overrides = v.parse(v.record(v.string(), v.string()), value);
	for (const [key, script] of Object.entries(overrides)) {
		const definition = COMMAND_TEMPLATE_DEFINITION_BY_KEY.get(key);
		if (!definition) throw new Error(`Unknown Command Template key '${key}'.`);
		const undeclared = undeclaredPlaceholders(script, definition.scalarPlaceholders, definition.listPlaceholders);
		if (undeclared.length) {
			const list = (names: readonly string[]) => names.map(name => `{{${name}}}`).join(', ') || 'none';
			const declared = [...definition.scalarPlaceholders, ...definition.listPlaceholders];
			throw new Error(`Command Template '${key}' has undeclared placeholders: ${list(undeclared)}. `
				+ `Available placeholders: ${list(declared)}.`);
		}
	}
	return overrides;
}

export class CommandTemplateStore {
	constructor(
		private readonly paths: ConfigPaths,
		private readonly repository: ConfigRepository,
		private readonly lock = new UpdateLock(),
	) {}

	read(owner?: string): CommandTemplateOverrides {
		return this.lock.read(() => validateOverrides(
			this.repository.readJson(this.paths.commandTemplateOverridesFile()) ?? {},
		), owner);
	}

	write(value: CommandTemplateOverrides, owner?: string): CommandTemplateOverrides {
		return this.lock.write(() => {
			const overrides = validateOverrides(value);
			// SAFETY: validateOverrides rejects every key absent from the command catalog.
			for (const key of Object.keys(overrides) as CommandTemplateKey[]) {
				if (overrides[key] === COMMAND_TEMPLATE_DEFAULTS[key]) delete overrides[key];
			}
			this.repository.writeJson(this.paths.commandTemplateOverridesFile(), overrides);
			return overrides;
		}, owner);
	}

	release(owner: string): void { this.lock.release(owner); }

	get(key: CommandTemplateKey): CommandTemplateEntry {
		const definition = COMMAND_TEMPLATE_DEFINITION_BY_KEY.get(key);
		if (!definition) throw new Error(`Unknown Command Template key '${key}'.`);
		const overrides = this.read();
		return {
			...definition, key,
			script: overrides[key] ?? COMMAND_TEMPLATE_DEFAULTS[key],
			isOverridden: Object.hasOwn(overrides, key),
		};
	}
}
