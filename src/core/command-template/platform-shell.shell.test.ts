import { describe, expect, it } from 'vitest';
import { ProcessError } from '../shared/errors.js';
import { interpolateCommandTemplate, shellLiteral } from './command-template-interpolation.js';
import { currentCommandTemplatePlatform } from './command-template-types.js';
import { FixedPlatformShellRunner } from './platform-shell-runner.js';

describe('fixed platform shell', () => {
	const platform = currentCommandTemplatePlatform();
	const runner = new FixedPlatformShellRunner();

	it('round-trips scalar and list arguments', async () => {
		const code = 'console.log(JSON.stringify(process.argv.slice(1)))';
		const executable = shellLiteral(process.execPath, platform);
		const template = `${platform === 'windows' ? '& ' : ''}${executable} -e `
			+ `${shellLiteral(code, platform)} {{scalar}} {{items}}`;
		const script = interpolateCommandTemplate(
			template,
			{ scalar: "a b'$;&`{}\nline", items: ['', 'two words'] },
			['scalar'], ['items'], platform,
		);
		const result = await runner.execute({
			key: 'shell.roundtrip', platform, script, cwd: process.cwd(), environment: {},
			mode: 'capture', timeoutMs: 10_000,
		});
		expect(JSON.parse(result.trim())).toEqual(["a b'$;&`{}\nline", '', 'two words']);
	});

	it('stops a multiline script at the first native failure and preserves its exit code', async () => {
		const node = shellLiteral(process.execPath, platform);
		const failingCode = shellLiteral('process.exit(7)', platform);
		const before = platform === 'windows' ? "Write-Output 'before'" : "printf 'before\\n'";
		const after = platform === 'windows' ? "Write-Output 'after'" : "printf 'after\\n'";
		const invoke = platform === 'windows' ? `& ${node} -e ${failingCode}` : `${node} -e ${failingCode}`;
		try {
			await runner.execute({
				key: 'shell.failure', platform,
				script: `${before}\n${invoke}\n${after}`,
				cwd: process.cwd(), environment: {}, mode: 'capture',
				timeoutMs: 10_000,
			});
			throw new Error('expected shell failure');
		} catch (error) {
			expect(error).toBeInstanceOf(ProcessError);
			expect((error as ProcessError).exitCode).toBe(7);
			expect((error as ProcessError).output).toContain('before');
			expect((error as ProcessError).output).not.toContain('after');
		}
	});

	it.runIf(platform === 'windows')('preserves PowerShell command-not-found details', async () => {
		await expect(runner.execute({
			key: 'shell.missing', platform,
			script: "& 'context-launch-command-that-does-not-exist'",
			cwd: process.cwd(), environment: {}, mode: 'capture',
			timeoutMs: 10_000,
		})).rejects.toMatchObject({
			exitCode: 1,
			output: expect.stringMatching(/not recognized/i),
		});
	});
});
