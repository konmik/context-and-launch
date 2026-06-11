import { describe, it, expect } from 'vitest';
import { worktreeFolderName, worktreeBranchName } from './worktree-naming.js';

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
	it('prefixes the truncated folder name with ai/', () => {
		expect(worktreeBranchName('st-0001-feature')).toBe('ai/st-0001-feature');
	});

	it('uses the truncated folder name for long tickets', () => {
		const name = 'x'.repeat(80);
		expect(worktreeBranchName(name)).toBe(`ai/${'x'.repeat(50)}`);
	});
});
