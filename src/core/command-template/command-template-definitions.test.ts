import fs from 'node:fs';
import path from 'node:path';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import {
	COMMAND_TEMPLATE_DEFINITION_BY_KEY,
	COMMAND_TEMPLATE_DEFINITIONS,
	gitEnvironment,
	remoteGitEnvironment,
} from './command-template-definitions.js';
import { COMMAND_TEMPLATE_GROUP_ORDER } from './command-template-types.js';

describe('Command Template catalog', () => {
	it('has a one-to-one key match with the flat bundled script map', () => {
		const bundled = v.parse(v.record(v.string(), v.string()), JSON.parse(fs.readFileSync(
			path.resolve('config-defaults/command-templates.json'), 'utf8',
		)));
		const definitionKeys = COMMAND_TEMPLATE_DEFINITIONS.map((item) => item.key).sort();
		expect(Object.keys(bundled).sort()).toEqual(definitionKeys);
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

	it('gives remote Git commands credential interaction without terminal prompts', () => {
		const remoteKeys = new Set([
			'ticket-sync.push.set-upstream',
			'ticket-sync.fetch-origin',
			'ticket-sync.fetch',
			'ticket-sync.push',
			'conflict-resolution.fetch',
			'conflict-resolution.push',
			'worktree.remote-branch.probe',
			'worktree.adopt-remote',
			'agent-worktree.remote-branch.probe',
			'agent-worktree.main.fetch',
			'agent-worktree.branch.delete-remote',
		]);
		const gitCommands = COMMAND_TEMPLATE_DEFINITIONS.filter(
			(definition) => Object.keys(definition.environment).length > 0,
		);
		expect(gitCommands.length).toBeGreaterThan(0);
		for (const definition of gitCommands) {
			if (remoteKeys.has(definition.key)) {
				expect(definition.environment).toBe(remoteGitEnvironment);
				expect(definition.timeoutMs).toBe(600_000);
			} else {
				expect(definition.environment).toBe(gitEnvironment);
			}
		}
		expect(gitEnvironment).toMatchObject({
			GIT_TERMINAL_PROMPT: '0',
			GIT_CONFIG_COUNT: '1',
			GIT_CONFIG_KEY_0: 'core.longpaths',
			GIT_CONFIG_VALUE_0: 'true',
		});
		expect(gitEnvironment).not.toHaveProperty('GCM_INTERACTIVE');
		expect(remoteGitEnvironment).toMatchObject({
			GIT_TERMINAL_PROMPT: '0',
			GCM_INTERACTIVE: 'auto',
		});
	});

	it('delivers a Review Prompt through the agent surface, not the raw pane', () => {
		const bundled = JSON.parse(fs.readFileSync(
			path.resolve('config-defaults/command-templates.json'), 'utf8',
		)) as Record<string, string>;
		expect(bundled['herdr.review-prompt.deliver']).toBe(
			'herdr agent prompt {{paneId}} {{prompt}}',
		);
	});

	it('returns operating-system open actions as soon as the shell spawns', () => {
		for (const platform of ['windows', 'macos', 'linux']) {
			expect(COMMAND_TEMPLATE_DEFINITION_BY_KEY.get(`open.directory.${platform}`))
				.toMatchObject({ mode: 'detached', detachDelayMs: 0 });
		}
	});

	it('owns Windows picker dialogs so they cannot open behind the browser', () => {
		const bundled = JSON.parse(fs.readFileSync(
			path.resolve('config-defaults/command-templates.json'), 'utf8',
		)) as Record<string, string>;
		for (const key of ['picker.files.windows', 'picker.directory.windows']) {
			expect(bundled[key]).toContain('$owner.TopMost = $true');
			expect(bundled[key]).toContain('$dialog.ShowDialog($owner)');
			expect(bundled[key]).toContain('$dialog.Dispose()');
			expect(bundled[key]).toContain('$owner.Dispose()');
		}
	});
});
