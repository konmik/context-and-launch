import bundledDefaults from '../../../config-defaults/command-templates.json' with { type: 'json' };
import type { ConfigPaths } from '../config/config-paths.js';
import type { ConfigRepository } from '../config/config-repository.js';
import { COMMAND_TEMPLATE_DEFINITION_BY_KEY, COMMAND_TEMPLATE_DEFINITIONS } from './command-template-definitions.js';
import type { CommandTemplateKey } from './command-template-definitions.js';
import { undeclaredPlaceholders } from './command-template-interpolation.js';
import type { CommandTemplateDefinition, CommandTemplateEntry } from './command-template-types.js';

type ScriptMap = Record<string, string>;

const BUNDLED_DEFAULTS_LABEL = 'The bundled Command Template catalog';

function validateScriptMap(value: unknown, fileLabel: string): ScriptMap {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error(`${fileLabel} must contain a JSON object of Command Template strings.`);
	}
	const result: ScriptMap = {};
	for (const [key, script] of Object.entries(value)) {
		if (typeof script !== 'string') {
			throw new Error(`Command Template '${key}' in ${fileLabel} must be a string.`);
		}
		result[key] = script;
	}
	return result;
}

function assertDeclaredPlaceholders(
	definition: CommandTemplateDefinition, script: string, sourceLabel: string,
): void {
	const undeclared = undeclaredPlaceholders(
		script, definition.scalarPlaceholders, definition.listPlaceholders,
	);
	if (undeclared.length === 0) return;
	const declared = [...definition.scalarPlaceholders, ...definition.listPlaceholders];
	const list = (names: readonly string[]) =>
		names.length > 0 ? names.map((name) => `{{${name}}}`).join(', ') : 'none';
	throw new Error(
		`${sourceLabel} defines Command Template '${definition.key}' with undeclared `
		+ `placeholders: ${list(undeclared)}. Available placeholders: ${list(declared)}.`,
	);
}

function assertKnownKeys(map: ScriptMap, fileLabel: string): void {
	for (const [key, script] of Object.entries(map)) {
		const definition = COMMAND_TEMPLATE_DEFINITION_BY_KEY.get(key);
		if (!definition) {
			throw new Error(`Unknown Command Template key '${key}' in ${fileLabel}.`);
		}
		assertDeclaredPlaceholders(definition, script, fileLabel);
	}
}

export class CommandTemplateStore {
	private defaults?: ScriptMap;

	constructor(
		private readonly paths: ConfigPaths,
		private readonly repository: ConfigRepository,
	) {}

	load(): CommandTemplateEntry[] {
		const defaults = this.loadDefaults();
		const overrides = this.loadOverrides();
		return COMMAND_TEMPLATE_DEFINITIONS.map((definition) =>
			this.toEntry(definition, defaults, overrides),
		);
	}

	get(key: CommandTemplateKey): CommandTemplateEntry {
		const definition = this.requireKnown(key);
		return this.toEntry(definition, this.loadDefaults(), this.loadOverrides());
	}

	save(key: CommandTemplateKey, script: string): CommandTemplateEntry {
		const definition = this.requireKnown(key);
		if (typeof script !== 'string') throw new Error('Command Template script must be a string.');
		assertDeclaredPlaceholders(definition, script, 'The edited script');
		const defaults = this.loadDefaults();
		const overrides = this.loadOverrides();
		if (script === defaults[key]) delete overrides[key];
		else overrides[key] = script;
		this.repository.writeJson(this.paths.commandTemplateOverridesFile(), overrides);
		return this.toEntry(definition, defaults, overrides);
	}

	reset(key: CommandTemplateKey): CommandTemplateEntry {
		const definition = this.requireKnown(key);
		const defaults = this.loadDefaults();
		const overrides = this.loadOverrides();
		delete overrides[key];
		this.repository.writeJson(this.paths.commandTemplateOverridesFile(), overrides);
		return this.toEntry(definition, defaults, overrides);
	}

	/**
	 * The default catalog is compiled into the application bundle, so it always
	 * ships with the app and can never be missing at runtime. It cannot change
	 * while the app runs, so it is validated once. The sparse override file is
	 * deliberately NOT cached: it is user-editable and may be synced externally,
	 * and every operation must observe the current contents.
	 */
	private loadDefaults(): ScriptMap {
		if (this.defaults) return this.defaults;
		const defaults = validateScriptMap(bundledDefaults, BUNDLED_DEFAULTS_LABEL);
		assertKnownKeys(defaults, BUNDLED_DEFAULTS_LABEL);
		const missing = COMMAND_TEMPLATE_DEFINITIONS
			.map((definition) => definition.key)
			.filter((key) => !Object.hasOwn(defaults, key));
		if (missing.length > 0) {
			throw new Error(`Bundled Command Templates are missing: ${missing.join(', ')}.`);
		}
		this.defaults = defaults;
		return defaults;
	}

	private loadOverrides(): ScriptMap {
		const file = this.paths.commandTemplateOverridesFile();
		const raw = this.repository.readJson(file);
		if (raw === null) return {};
		const overrides = validateScriptMap(raw, file);
		assertKnownKeys(overrides, file);
		return overrides;
	}

	private requireKnown(key: CommandTemplateKey): CommandTemplateDefinition {
		const definition = COMMAND_TEMPLATE_DEFINITION_BY_KEY.get(key);
		if (!definition) {
			throw new Error(`Unknown Command Template key '${key}'.`);
		}
		return definition;
	}

	private toEntry(
		definition: CommandTemplateDefinition,
		defaults: ScriptMap,
		overrides: ScriptMap,
	): CommandTemplateEntry {
		const isOverridden = Object.hasOwn(overrides, definition.key);
		return {
			...definition,
			key: definition.key as CommandTemplateKey,
			script: isOverridden ? overrides[definition.key] : defaults[definition.key],
			isOverridden,
		};
	}
}
