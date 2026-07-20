import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { CommandTemplateStore } from './command-template-store.js';
import { CommandTemplateService } from './command-template-service.js';
import type { PlatformShellRunner, ShellExecutionRequest } from './command-template-types.js';

describe('CommandTemplateService', () => {
	it('renders metadata into a complete runner request and logs the fixed key', async () => {
		const requests: ShellExecutionRequest[] = [];
		const runner: PlatformShellRunner = {
			execute: async (request) => {
				requests.push(request);
				return 'ok';
			},
			executeSync: vi.fn(),
		};
		const store = {
			get: () => ({
				key: 'git.commit', label: 'Commit', featureGroup: 'Git and repository checks',
				platforms: ['windows'], scalarPlaceholders: ['message'], listPlaceholders: [],
				environment: { GIT_TERMINAL_PROMPT: '0' },
				mode: 'capture', timeoutMs: 30_000,
				script: 'git commit -m {{message}}', isOverridden: true,
			}),
		} as unknown as CommandTemplateStore;
		const log = vi.fn();
		const service = new CommandTemplateService(store, runner, 'windows', log);
		expect(await service.execute('git.commit', path.resolve('.'), { message: "it's ready" }))
			.toBe('ok');
		expect(requests[0]).toMatchObject({
			key: 'git.commit', mode: 'capture', timeoutMs: 30_000,
			environment: { GIT_TERMINAL_PROMPT: '0' },
		});
		expect(requests[0].script).toContain("'it''s ready'");
		expect(log).toHaveBeenCalledWith(
			'command-template', 'start', { commandTemplateKey: 'git.commit' },
		);
	});

});
