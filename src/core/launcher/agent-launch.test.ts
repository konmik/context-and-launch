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

describe('parseLaunchRequest profileName (code-inspection)', () => {
	const source = fs.readFileSync(
		path.resolve(__dirname, 'agent-launch.ts'),
		'utf-8'
	);

	// Replicate the pure function from agent-launch.ts
	interface LaunchRequest {
		templateName: string; checkedSkills: string[]; useWorktree: boolean; profileName: string;
	}
	function parseLaunchRequest(body: unknown): LaunchRequest {
		const result: LaunchRequest = {
			templateName: 'Default', checkedSkills: [], useWorktree: false, profileName: '',
		};
		if (body && typeof body === 'object') {
			const b = body as Record<string, unknown>;
			if (typeof b.templateName === 'string') result.templateName = b.templateName;
			if (Array.isArray(b.checkedSkills)) result.checkedSkills = b.checkedSkills;
			if (typeof b.useWorktree === 'boolean') result.useWorktree = b.useWorktree;
			if (typeof b.profileName === 'string') result.profileName = b.profileName;
		}
		return result;
	}

	it('replicated function matches source code', () => {
		expect(source).toContain('profileName: ""');
		expect(source).toContain('typeof b.profileName === "string"');
	});

	it('parseLaunchRequest with profileName extracts string value', () => {
		const result = parseLaunchRequest({ profileName: 'Claude Win' });
		expect(result.profileName).toBe('Claude Win');
	});

	it('parseLaunchRequest with missing profileName defaults to empty string', () => {
		const result = parseLaunchRequest({});
		expect(result.profileName).toBe('');
	});

	it('parseLaunchRequest with non-string profileName defaults to empty string', () => {
		const result = parseLaunchRequest({ profileName: 42 });
		expect(result.profileName).toBe('');
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

	it('launchAgent no longer creates a bat file', () => {
		// Extract the launchAgent function body
		const fnMatch = source.match(/function launchAgent\([^)]*\)[^{]*\{([\s\S]*?)^}/m);
		expect(fnMatch).not.toBeNull();
		const body = fnMatch![1];
		expect(body).not.toContain('batPath');
		expect(body).not.toContain('.bat');
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
