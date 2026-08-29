import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fromPartial } from '@total-typescript/shoehorn';
import type { CommandTemplateService } from '../command-template/command-template-service.js';
import { parseLaunchRequest } from './launch-request.js';
import {
	buildAgentDisplayName, buildWindowTitle, runLauncherProfile,
} from './profile-launch.js';

const executeTrustedScript = vi.fn().mockResolvedValue('');
const commands = fromPartial<CommandTemplateService>({ executeTrustedScript });

describe('buildWindowTitle', () => {
	const ticket = { number: 'ST-47', title: 'Fix login timeout' };

	it('uses the Agent Worktree folder when launching in a worktree', () => {
		const worktreePath = path.join('root', 'worktrees', 'st-47-fix-login-timeout');
		expect(buildWindowTitle(ticket, { worktreePath }))
			.toBe('st-47-fix-login-timeout -- AI');
	});

	it('uses the Ticket title, Ticket Number, and Project name without a worktree', () => {
		expect(buildWindowTitle(ticket, { projectName: 'Alpha' }))
			.toBe('Fix login timeout ST-47 - Alpha -- AI');
	});
});

describe('buildAgentDisplayName', () => {
	it('builds the Agent name without the terminal title suffix', () => {
		expect(buildAgentDisplayName(
			{ number: 'ST-47', title: 'Fix login timeout' },
			{ projectName: 'Alpha' },
		)).toBe('Fix login timeout ST-47 - Alpha');
	});
});

describe('parseLaunchRequest', () => {
	it('parseLaunchRequest with initialPrompt extracts string value', () => {
		const result = parseLaunchRequest({ initialPrompt: 'do the thing' });
		expect(result.initialPrompt).toBe('do the thing');
	});

	it('parseLaunchRequest with profileName extracts string value', () => {
		const result = parseLaunchRequest({ profileName: 'Claude Win' });
		expect(result.profileName).toBe('Claude Win');
	});

	it('parseLaunchRequest with missing fields defaults correctly', () => {
		const result = parseLaunchRequest({});
		expect(result.initialPrompt).toBe('');
		expect(result.profileName).toBe('');
		expect(result.useWorktree).toBe(false);
		expect(result.force).toBe(false);
		expect(result.skipBehindRemote).toBe(false);
		expect(result.launchDir).toBe('');
	});

	it('parseLaunchRequest with launchDir extracts string value', () => {
		const result = parseLaunchRequest({ launchDir: '/my/dir' });
		expect(result.launchDir).toBe('/my/dir');
	});

	it('parseLaunchRequest with non-string initialPrompt defaults to empty string', () => {
		const result = parseLaunchRequest({ initialPrompt: 42 });
		expect(result.initialPrompt).toBe('');
	});
});

describe('launchAgent profile-based spawn (code-inspection)', () => {
	const source = fs.readFileSync(
		path.resolve(__dirname, 'agent-launch.ts'),
		'utf-8'
	);
	const profileLaunchSource = fs.readFileSync(
		path.resolve(__dirname, 'profile-launch.ts'),
		'utf-8'
	);

	it('launchAgent delegates to spawnProfile with launchDir as cwd', () => {
		expect(source).toMatch(/spawnProfile\(profile,\s*commandVars,\s*launchDir\)/);
	});

	it('spawnProfile delegates custom bodies to the trusted fixed-shell runner', () => {
		expect(profileLaunchSource).toContain('executeTrustedScript');
	});

	it('spawnProfile preserves custom script bodies without tokenization', () => {
		expect(source).not.toContain('interpolateCommand(');
		expect(profileLaunchSource).not.toContain('interpolateCommand(');
		expect(profileLaunchSource).toMatch(/script:\s*profile\.command/);
	});

	it('launchAgent passes initialPrompt from launchRequest directly', () => {
		expect(source).toMatch(/launchRequest\.initialPrompt/);
	});

	it('launchAgent does not assemble or interpolate prompts server-side', () => {
		expect(source).not.toContain('assemblePrompt');
		expect(source).not.toContain('interpolatePrompt');
		expect(source).not.toContain('FALLBACK_PROMPT');
	});

	it('launchAgent does not save column defaults (saved by UI on change)', () => {
		expect(source).not.toMatch(/saveColumnDefaults|patchColumnDefaults/);
	});
});

describe('spawnProfile trusted script execution', () => {
	it('passes the complete custom body and values to the fixed shell service', async () => {
		await runLauncherProfile(
			commands,
			{ name: 'Custom', command: 'my-agent --flag {{initialPrompt}}' },
			{ configDefaultsDir: '/fake/config-defaults', initialPrompt: 'do the thing' },
			'/fake/cwd',
		);
		expect(executeTrustedScript).toHaveBeenCalledWith(expect.objectContaining({
			source: { kind: 'profile', profileName: 'Custom' },
			script: 'my-agent --flag {{initialPrompt}}',
			values: { configDefaultsDir: '/fake/config-defaults', initialPrompt: 'do the thing' },
			cwd: '/fake/cwd',
		}));
	});
});

describe('agent-launch holds no command text', () => {
	const source = fs.readFileSync(path.resolve(__dirname, 'agent-launch.ts'), 'utf-8');

	it('never names an executable or escapes shell values itself', () => {
		expect(source).not.toMatch(/\b(?:claude|powershell|pwsh|osascript|wt|mkdir|printf)\b/);
		expect(source).not.toContain('shellLiteral');
	});
});
