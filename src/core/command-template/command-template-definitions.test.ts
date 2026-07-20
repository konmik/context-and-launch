import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	COMMAND_TEMPLATE_DEFINITION_BY_KEY,
	COMMAND_TEMPLATE_DEFINITIONS,
} from './command-template-definitions.js';
import { COMMAND_TEMPLATE_GROUP_ORDER } from './command-template-types.js';

describe('Command Template catalog', () => {
	it('has a one-to-one key match with the flat bundled script map', () => {
		const bundled = JSON.parse(fs.readFileSync(
			path.resolve('config-defaults/command-templates.json'), 'utf8',
		)) as Record<string, unknown>;
		const definitionKeys = COMMAND_TEMPLATE_DEFINITIONS.map((item) => item.key).sort();
		expect(Object.keys(bundled).sort()).toEqual(definitionKeys);
		expect(Object.values(bundled).every((value) => typeof value === 'string')).toBe(true);
		expect(new Set(definitionKeys).size).toBe(definitionKeys.length);
	});

	it('uses valid groups and flat suffix platform keys', () => {
		for (const definition of COMMAND_TEMPLATE_DEFINITIONS) {
			expect(COMMAND_TEMPLATE_GROUP_ORDER).toContain(definition.featureGroup);
			expect(definition.platforms.length).toBeGreaterThan(0);
			if (definition.platforms.length === 1) {
				expect(definition.key.endsWith(`.${definition.platforms[0]}`)).toBe(true);
			}
		}
	});

	it('returns operating-system open actions as soon as the shell spawns', () => {
		for (const platform of ['windows', 'macos', 'linux']) {
			expect(COMMAND_TEMPLATE_DEFINITION_BY_KEY.get(`open.directory.${platform}`))
				.toMatchObject({ mode: 'detached', detachDelayMs: 0 });
		}
	});
});
