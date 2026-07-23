import { describe, expect, it } from 'vitest';
import type { ShellExecutionRequest } from './command-template-types.js';
import { withTestGitEnvironment } from './command-template.test-utils.js';

describe('withTestGitEnvironment', () => {
	it('preserves command Git settings and adds every shared test setting', () => {
		const request: ShellExecutionRequest = {
			key: 'git.version',
			platform: 'linux',
			script: 'git --version',
			cwd: '.',
			environment: {
				GIT_TERMINAL_PROMPT: '0',
				GIT_CONFIG_COUNT: '1',
				GIT_CONFIG_KEY_0: 'core.longpaths',
				GIT_CONFIG_VALUE_0: 'true',
			},
			mode: 'capture',
			timeoutMs: 30_000,
		};

		const result = withTestGitEnvironment(request);
		const count = Number(result.environment.GIT_CONFIG_COUNT);
		const config = Object.fromEntries(Array.from({ length: count }, (_, index) => [
			result.environment[`GIT_CONFIG_KEY_${index}`],
			result.environment[`GIT_CONFIG_VALUE_${index}`],
		]));

		expect(result.environment.GIT_TERMINAL_PROMPT).toBe('0');
		expect(config).toEqual({
			'core.longpaths': 'true',
			'user.email': 'test@test.com',
			'user.name': 'Test',
			'init.defaultBranch': 'master',
			'commit.gpgsign': 'false',
			'gc.auto': '0',
			'maintenance.auto': 'false',
			'core.fsmonitor': 'false',
			'core.editor': 'true',
		});
	});
});
