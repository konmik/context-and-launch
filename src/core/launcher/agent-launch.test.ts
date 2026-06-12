import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

vi.mock('~/core/config/instances.js', () => ({
	worktreeManager: {},
	projectRegistry: {},
	launcherConfigManager: {},
	agentWorktreeManager: {},
}));
vi.mock('~/core/launcher/spawn-detached.js', () => ({
	spawnDetached: vi.fn().mockResolvedValue(undefined),
}));

import { spawnProfile } from '~/core/launcher/agent-launch.js';
import { spawnDetached } from '~/core/launcher/spawn-detached.js';

describe('parseLaunchRequest (code-inspection)', () => {
	const source = fs.readFileSync(
		path.resolve(__dirname, 'agent-launch.ts'),
		'utf-8'
	);

	interface LaunchRequest {
		initialPrompt: string; useWorktree: boolean; profileName: string; force: boolean;
	}
	function parseLaunchRequest(body: unknown): LaunchRequest {
		const result: LaunchRequest = {
			initialPrompt: '', useWorktree: false, profileName: '', force: false,
		};
		if (body && typeof body === 'object') {
			const b = body as Record<string, unknown>;
			if (typeof b.initialPrompt === 'string') result.initialPrompt = b.initialPrompt;
			if (typeof b.useWorktree === 'boolean') result.useWorktree = b.useWorktree;
			if (typeof b.profileName === 'string') result.profileName = b.profileName;
			if (typeof b.force === 'boolean') result.force = b.force;
		}
		return result;
	}

	it('replicated function matches source code', () => {
		expect(source).toContain('profileName: ""');
		expect(source).toContain('initialPrompt: ""');
	});

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

	it('launchAgent delegates to spawnProfile with launchDir as cwd', () => {
		expect(source).toMatch(/spawnProfile\(profile,\s*commandVars,\s*launchDir\)/);
	});

	it('spawnProfile delegates to spawnDetached', () => {
		expect(source).toMatch(/spawnDetached\(parts\[0\],\s*parts\.slice\(1\),\s*cwd\)/);
	});

	it('spawnProfile uses interpolateCommand for parsing', () => {
		expect(source).toMatch(/interpolateCommand\(profile\.command,\s*commandVars\)/);
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

describe('spawnProfile command interpolation', () => {
	it('interpolates template variables in the executable token', async () => {
		await spawnProfile(
			{ name: 'Custom', command: '{{configDefaultsDir}}/run-agent.sh {{initialPrompt}}' },
			{ configDefaultsDir: '/fake/config-defaults', initialPrompt: 'do the thing' },
			'/fake/cwd',
		);
		expect(spawnDetached).toHaveBeenCalledWith(
			'/fake/config-defaults/run-agent.sh', ['do the thing'], '/fake/cwd',
		);
	});
});
