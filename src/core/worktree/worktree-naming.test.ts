import { describe, it, expect } from 'vitest';
import {
	worktreeFolderName, worktreeBranchName, resolveAgentWorktreeLocation,
} from './worktree-naming.js';

describe('worktreeFolderName', () => {
	it('returns short names unchanged', () => {
		expect(worktreeFolderName('st-0001-feature')).toBe('st-0001-feature');
	});

	it('returns a name of exactly 50 characters unchanged', () => {
		const name = 'a'.repeat(50);
		expect(worktreeFolderName(name)).toBe(name);
	});

	it('truncates long names to 50 characters', () => {
		const name = 'wna-1533-opening-customer-support-from-login-error-alert-error-is-dimissed';
		const result = worktreeFolderName(name);
		expect(result.length).toBeLessThanOrEqual(50);
		expect(name.startsWith(result)).toBe(true);
	});

	it('strips trailing hyphens left by truncation', () => {
		const name = 'a'.repeat(49) + '-tail';
		expect(worktreeFolderName(name)).toBe('a'.repeat(49));
	});
});

describe('worktreeBranchName', () => {
	it('returns folder name unchanged when prefix is omitted', () => {
		expect(worktreeBranchName('st-0001-feature')).toBe('st-0001-feature');
	});

	it('prefixes the folder name when prefix is set', () => {
		expect(worktreeBranchName('st-0001-feature', 'ai')).toBe('ai/st-0001-feature');
	});

	it('uses the truncated folder name for long tickets', () => {
		const name = 'x'.repeat(80);
		expect(worktreeBranchName(name)).toBe('x'.repeat(50));
	});

	it('uses a custom prefix', () => {
		expect(worktreeBranchName('st-0001-feature', 'bot')).toBe('bot/st-0001-feature');
	});
});

describe('resolveAgentWorktreeLocation', () => {
	it('computes path and branch from settings without a prefix', () => {
		const loc = resolveAgentWorktreeLocation('st-0001-feature', { worktreeRootPath: '/root' });
		expect(loc).toEqual({
			worktreePath: '/root/st-0001-feature',
			branchName: 'st-0001-feature',
			isDefaultLocation: true,
		});
	});

	it('applies the branch prefix to the computed branch', () => {
		const loc = resolveAgentWorktreeLocation(
			'st-0001-feature', { worktreeRootPath: '/root', branchPrefix: 'ai' },
		);
		expect(loc).toEqual({
			worktreePath: '/root/st-0001-feature',
			branchName: 'ai/st-0001-feature',
			isDefaultLocation: true,
		});
	});

	it('prefers a saved worktree path but still computes the branch', () => {
		const loc = resolveAgentWorktreeLocation(
			'st-0001-feature', { worktreeRootPath: '/root', branchPrefix: 'ai' },
			{ savedWorktreePath: '/custom/wt' },
		);
		expect(loc).toEqual({
			worktreePath: '/custom/wt',
			branchName: 'ai/st-0001-feature',
			isDefaultLocation: false,
		});
	});

	it('prefers a saved branch name but still computes the path', () => {
		const loc = resolveAgentWorktreeLocation(
			'st-0001-feature', { worktreeRootPath: '/root' },
			{ savedBranchName: 'saved-branch' },
		);
		expect(loc).toEqual({
			worktreePath: '/root/st-0001-feature',
			branchName: 'saved-branch',
			isDefaultLocation: true,
		});
	});

	it('uses both saved values when provided', () => {
		const loc = resolveAgentWorktreeLocation(
			'st-0001-feature', { worktreeRootPath: '/root' },
			{ savedWorktreePath: '/custom/wt', savedBranchName: 'saved-branch' },
		);
		expect(loc).toEqual({
			worktreePath: '/custom/wt',
			branchName: 'saved-branch',
			isDefaultLocation: false,
		});
	});

	it('truncates long folder names through worktreeFolderName for the computed path', () => {
		const name = 'x'.repeat(80);
		const loc = resolveAgentWorktreeLocation(name, { worktreeRootPath: '/root' });
		expect(loc.worktreePath).toBe(`/root/${'x'.repeat(50)}`);
		expect(loc.branchName).toBe('x'.repeat(50));
	});
});
