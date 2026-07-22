import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDirectInvocationArgv } from './command-template-direct-invocation.js';
import { COMMAND_TEMPLATE_DEFINITION_BY_KEY } from './command-template-definitions.js';

describe('Command Template direct invocation', () => {
	it('builds argv with raw placeholder values for a single-line template', () => {
		expect(buildDirectInvocationArgv(
			'git commit -m {{message}}',
			{ cwd: 'x', message: "it's got spaces" },
			['message'], [],
		)).toEqual(['git', 'commit', '-m', "it's got spaces"]);
	});

	it('unwraps single-quoted literal tokens', () => {
		expect(buildDirectInvocationArgv("git diff --quiet '@{u}'", {}, [], []))
			.toEqual(['git', 'diff', '--quiet', '@{u}']);
	});

	it('spreads list values and omits empty lists', () => {
		expect(buildDirectInvocationArgv(
			'git commit-tree {{signArgs}} {{tree}}',
			{ signArgs: ['-S'], tree: 'abc' }, ['tree'], ['signArgs'],
		)).toEqual(['git', 'commit-tree', '-S', 'abc']);
		expect(buildDirectInvocationArgv(
			'git commit-tree {{signArgs}} {{tree}}',
			{ signArgs: [], tree: 'abc' }, ['tree'], ['signArgs'],
		)).toEqual(['git', 'commit-tree', 'abc']);
	});

	it('rejects multiline templates', () => {
		expect(buildDirectInvocationArgv('git fetch\ngit rebase', {}, [], [])).toBeUndefined();
	});

	it('rejects shell syntax', () => {
		expect(buildDirectInvocationArgv('git log | head', {}, [], [])).toBeUndefined();
		expect(buildDirectInvocationArgv(
			'(Get-Process -Id {{pid}}).StartTime', { pid: '1' }, ['pid'], [],
		)).toBeUndefined();
		expect(buildDirectInvocationArgv(
			'zenity --filename={{startDir}}/', { startDir: 'x' }, ['startDir'], [],
		)).toBeUndefined();
	});

	it('folds a leading-placeholder path suffix into one argv entry', () => {
		expect(buildDirectInvocationArgv(
			'powershell -File {{configDefaultsDir}}/run-agent.ps1 {{initialPrompt}}',
			{ configDefaultsDir: 'C:\\cfg', initialPrompt: 'go' },
			['configDefaultsDir', 'initialPrompt'], [],
		)).toEqual(['powershell', '-File', 'C:\\cfg/run-agent.ps1', 'go']);
	});

	it('keeps a quote-and-space-laden prompt intact for the default launch profile', () => {
		const prompt =
			'Read the files. Check "C:\\Users\\me\\Downloads\\Release notes _ Doc.pdf"';
		expect(buildDirectInvocationArgv(
			'powershell -File {{configDefaultsDir}}/run-agent.ps1 {{initialPrompt}} {{windowTitle}}' +
				' {{markerPath}} claude --dangerously-skip-permissions',
			{
				configDefaultsDir: 'C:\\cfg', initialPrompt: prompt,
				windowTitle: 'WNA-1619 -- AI', markerPath: 'C:\\marker.json',
			},
			['configDefaultsDir', 'initialPrompt', 'windowTitle', 'markerPath'], [],
		)).toEqual([
			'powershell', '-File', 'C:\\cfg/run-agent.ps1', prompt,
			'WNA-1619 -- AI', 'C:\\marker.json', 'claude', '--dangerously-skip-permissions',
		]);
	});

	it('rejects placeholders without a provided value and unknown placeholders', () => {
		expect(buildDirectInvocationArgv('git rev-parse {{ref}}', {}, ['ref'], [])).toBeUndefined();
		expect(buildDirectInvocationArgv(
			'git rev-parse {{unknown}}', { unknown: 'x' }, [], [],
		)).toBeUndefined();
	});

	it('accepts a placeholder as the program token and resolves its value', () => {
		expect(buildDirectInvocationArgv(
			'{{program}} --version', { program: 'git' }, ['program'], [],
		)).toEqual(['git', '--version']);
	});

	it('rejects a program placeholder with no supplied value', () => {
		expect(buildDirectInvocationArgv('{{program}} --version', {}, ['program'], []))
			.toBeUndefined();
	});

	it('qualifies every bundled single-line git template for direct execution', () => {
		const defaults: Record<string, string> = JSON.parse(fs.readFileSync(
			path.resolve('config-defaults', 'command-templates.json'), 'utf8',
		));
		const singleLineGitKeys = Object.entries(defaults)
			.filter(([, script]) => script.startsWith('git ') && !script.includes('\n'))
			.map(([key]) => key);
		expect(singleLineGitKeys.length).toBeGreaterThan(30);
		for (const key of singleLineGitKeys) {
			const definition = COMMAND_TEMPLATE_DEFINITION_BY_KEY.get(key);
			if (!definition) throw new Error(`No definition for '${key}'.`);
			const values = Object.fromEntries([
				...definition.scalarPlaceholders.map((name) => [name, 'value']),
				...definition.listPlaceholders.map((name) => [name, ['value']]),
			]);
			expect(
				buildDirectInvocationArgv(
					defaults[key], values, definition.scalarPlaceholders, definition.listPlaceholders,
				),
				`'${key}' must stay directly executable`,
			).toBeDefined();
		}
	});
});
