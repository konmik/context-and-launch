import { describe, it, expect } from 'vitest';
import {
	wouldCreateDependencyCycle,
	wouldCreateMembershipCycle,
	rewriteInboundReferences,
	removeInboundReferences,
} from './ticket-relations.js';
import type { StatusJson } from './ticket-repository.js';

describe('wouldCreateDependencyCycle', () => {
	it('detects a direct cycle', () => {
		const tickets = [
			{ number: 'A', dependsOn: ['B'] },
			{ number: 'B' },
		];
		expect(wouldCreateDependencyCycle(tickets, 'B', 'A')).toBe(true);
	});

	it('detects a transitive cycle', () => {
		const tickets = [
			{ number: 'A', dependsOn: ['B'] },
			{ number: 'B', dependsOn: ['C'] },
			{ number: 'C' },
		];
		expect(wouldCreateDependencyCycle(tickets, 'C', 'A')).toBe(true);
	});

	it('detects a self-cycle', () => {
		const tickets = [{ number: 'A' }];
		expect(wouldCreateDependencyCycle(tickets, 'A', 'A')).toBe(true);
	});

	it('returns false when no cycle', () => {
		const tickets = [
			{ number: 'A' },
			{ number: 'B' },
			{ number: 'C', dependsOn: ['A'] },
		];
		expect(wouldCreateDependencyCycle(tickets, 'B', 'A')).toBe(false);
	});

	it('tolerates absent references', () => {
		const tickets = [
			{ number: 'A', dependsOn: ['MISSING'] },
			{ number: 'B' },
		];
		expect(wouldCreateDependencyCycle(tickets, 'B', 'A')).toBe(false);
	});
});

describe('wouldCreateMembershipCycle', () => {
	it('detects a cycle through parent chain', () => {
		const tickets = [
			{ number: 'G1', memberOf: 'G2' },
			{ number: 'G2' },
			{ number: 'A' },
		];
		expect(wouldCreateMembershipCycle(tickets, ['G2'], 'G1')).toBe(true);
	});

	it('returns false when no cycle', () => {
		const tickets = [
			{ number: 'G1' },
			{ number: 'A' },
			{ number: 'B' },
		];
		expect(wouldCreateMembershipCycle(tickets, ['A', 'B'], 'G1')).toBe(false);
	});

	it('tolerates absent references in parent chain', () => {
		const tickets = [
			{ number: 'G1', memberOf: 'MISSING' },
			{ number: 'A' },
		];
		expect(wouldCreateMembershipCycle(tickets, ['A'], 'G1')).toBe(false);
	});

	it('detects when group is among members', () => {
		const tickets = [
			{ number: 'G1' },
		];
		expect(wouldCreateMembershipCycle(tickets, ['G1'], 'G1')).toBe(true);
	});
});

describe('rewriteInboundReferences', () => {
	const base: StatusJson = { number: 'X', title: 'X', status: 'todo', useWorktree: false };

	it('rewrites dependsOn only', () => {
		const status: StatusJson = { ...base, dependsOn: ['OLD', 'OTHER'] };
		const result = rewriteInboundReferences(status, 'OLD', 'NEW');
		expect(result).toBeDefined();
		expect(result!.dependsOn).toEqual(['NEW', 'OTHER']);
		expect(result!.memberOf).toBeUndefined();
	});

	it('rewrites memberOf only', () => {
		const status: StatusJson = { ...base, memberOf: 'OLD' };
		const result = rewriteInboundReferences(status, 'OLD', 'NEW');
		expect(result).toBeDefined();
		expect(result!.memberOf).toBe('NEW');
	});

	it('rewrites both dependsOn and memberOf', () => {
		const status: StatusJson = { ...base, dependsOn: ['OLD'], memberOf: 'OLD' };
		const result = rewriteInboundReferences(status, 'OLD', 'NEW');
		expect(result).toBeDefined();
		expect(result!.dependsOn).toEqual(['NEW']);
		expect(result!.memberOf).toBe('NEW');
	});

	it('returns undefined when nothing references oldNumber', () => {
		const status: StatusJson = { ...base, dependsOn: ['OTHER'], memberOf: 'ANOTHER' };
		expect(rewriteInboundReferences(status, 'OLD', 'NEW')).toBeUndefined();
	});

	it('returns undefined for status with no relations', () => {
		expect(rewriteInboundReferences(base, 'OLD', 'NEW')).toBeUndefined();
	});
});

describe('removeInboundReferences', () => {
	const base: StatusJson = { number: 'X', title: 'X', status: 'todo', useWorktree: false };

	it('removes from dependsOn and drops field when empty', () => {
		const status: StatusJson = { ...base, dependsOn: ['GONE'] };
		const result = removeInboundReferences(status, 'GONE');
		expect(result).toBeDefined();
		expect(result!.dependsOn).toBeUndefined();
	});

	it('removes from dependsOn keeping remaining entries', () => {
		const status: StatusJson = { ...base, dependsOn: ['GONE', 'KEEP'] };
		const result = removeInboundReferences(status, 'GONE');
		expect(result).toBeDefined();
		expect(result!.dependsOn).toEqual(['KEEP']);
	});

	it('removes memberOf', () => {
		const status: StatusJson = { ...base, memberOf: 'GONE' };
		const result = removeInboundReferences(status, 'GONE');
		expect(result).toBeDefined();
		expect(result!.memberOf).toBeUndefined();
	});

	it('removes both dependsOn and memberOf', () => {
		const status: StatusJson = { ...base, dependsOn: ['GONE'], memberOf: 'GONE' };
		const result = removeInboundReferences(status, 'GONE');
		expect(result).toBeDefined();
		expect(result!.dependsOn).toBeUndefined();
		expect(result!.memberOf).toBeUndefined();
	});

	it('returns undefined when nothing references removedNumber', () => {
		const status: StatusJson = { ...base, dependsOn: ['OTHER'], memberOf: 'ANOTHER' };
		expect(removeInboundReferences(status, 'GONE')).toBeUndefined();
	});

	it('returns undefined for status with no relations', () => {
		expect(removeInboundReferences(base, 'GONE')).toBeUndefined();
	});
});
