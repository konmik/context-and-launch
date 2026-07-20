import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { CommandTemplateService } from './command-template-service.js';
import type { CommandTemplateStore } from './command-template-store.js';
import { FixedPlatformShellRunner } from './platform-shell-runner.js';
import { useTempDirs } from './platform-shell-fixture.test-utils.js';

const makeTempDir = useTempDirs('command-template-service-shell-test-');

describe.runIf(process.platform === 'win32')('trusted Windows Profile scripts', () => {
	it('keeps a path suffix attached to an interpolated directory placeholder', async () => {
		const cwd = makeTempDir();
		const defaultsDir = path.join(cwd, 'config-defaults');
		fs.mkdirSync(defaultsDir);
		fs.writeFileSync(
			path.join(defaultsDir, 'probe.ps1'),
			'Write-Output $args[0]\r\n',
		);
		const service = new CommandTemplateService(
			{} as CommandTemplateStore,
			new FixedPlatformShellRunner(),
			'windows',
			vi.fn(),
		);

		await expect(service.executeTrustedScript({
			source: { kind: 'profile', profileName: 'Windows probe' },
			script: 'powershell -NoProfile -File {{configDefaultsDir}}/probe.ps1 {{message}}',
			values: { configDefaultsDir: defaultsDir, message: 'profile launched' },
			knownScalarPlaceholders: ['configDefaultsDir', 'message'],
			cwd,
			mode: 'capture',
		})).resolves.toContain('profile launched');
	});
});
