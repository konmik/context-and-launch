import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { errorMessage } from './errors.js';
import { TicketStore } from './ticket-store.js';
import { git } from './git.js';

/**
 * Tests that non-JSON request bodies to the context PUT endpoint produce
 * safe 400 responses without leaking stack traces or file paths.
 *
 * The PUT handler does: await request.json()
 * For non-JSON bodies this throws a SyntaxError. The route catches it
 * and returns: new Response(errorMessage(e), { status: 400 })
 *
 * We test errorMessage with the actual SyntaxError that Request.json() throws
 * for various invalid bodies to confirm no internal info leaks.
 */
describe('PUT /context/:name non-JSON body handling', () => {
	async function getJsonParseError(body: BodyInit): Promise<Error> {
		const request = new Request('http://localhost/test', {
			method: 'PUT',
			body,
		});
		try {
			await request.json();
			throw new Error('Expected json() to throw');
		} catch (e) {
			return e as Error;
		}
	}

	it('plain text body: error message has no stack trace or file paths', async () => {
		const err = await getJsonParseError('this is not json');
		const msg = errorMessage(err);

		expect(msg).toBeTruthy();
		expect(msg).not.toContain('\\');
		expect(msg).not.toContain('/src/');
		expect(msg).not.toContain('node_modules');
		expect(msg).not.toContain('at ');
		expect(msg).not.toContain('.ts:');
		expect(msg).not.toContain('.js:');
	});

	it('empty string body: error message is safe', async () => {
		const err = await getJsonParseError('');
		const msg = errorMessage(err);

		expect(msg).toBeTruthy();
		expect(msg).not.toContain('\\');
		expect(msg).not.toContain('/src/');
		expect(msg).not.toContain('node_modules');
		expect(msg).not.toContain('at ');
	});

	it('binary-like body: error message is safe', async () => {
		const binary = new Uint8Array([0x00, 0x01, 0xFF, 0xFE]);
		const err = await getJsonParseError(binary);
		const msg = errorMessage(err);

		expect(msg).toBeTruthy();
		expect(msg).not.toContain('\\');
		expect(msg).not.toContain('/src/');
		expect(msg).not.toContain('node_modules');
		expect(msg).not.toContain('at ');
	});

	it('HTML body: error message is safe', async () => {
		const err = await getJsonParseError('<html><body>hi</body></html>');
		const msg = errorMessage(err);

		expect(msg).toBeTruthy();
		expect(msg).not.toContain('\\');
		expect(msg).not.toContain('/src/');
		expect(msg).not.toContain('at ');
	});

	it('simulated route returns 400 with safe body for non-JSON', async () => {
		// Simulate the exact logic in the PUT handler's catch block
		const request = new Request('http://localhost/test', {
			method: 'PUT',
			body: 'not json',
		});

		let response: Response;
		try {
			await request.json();
			response = new Response(null, { status: 204 });
		} catch (e) {
			response = new Response(errorMessage(e), { status: 400 });
		}

		expect(response.status).toBe(400);
		const text = await response.text();
		expect(text).toBeTruthy();
		// Must not contain stack traces or internal paths
		expect(text).not.toMatch(/at\s+\w+\s+\(/);
		expect(text).not.toContain('node_modules');
		expect(text).not.toContain('.ts:');
		expect(text).not.toContain('src/');
	});
});

describe('saveTicketContext rejects non-string content', () => {
	const dirs: string[] = [];

	afterEach(() => {
		for (const d of dirs) {
			try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { console.warn('cleanup failed', e); }
		}
		dirs.length = 0;
	});

	const badValues: [string, unknown][] = [
		['null', null],
		['undefined', undefined],
		['number 123', 123],
		['empty object', {}],
		['array', [1, 2]],
		['boolean true', true],
	];

	for (const [label, value] of badValues) {
		it(`throws TypeError for content=${label}`, async () => {
			const worktreeDir = await createGitWorktree();
			dirs.push(worktreeDir);
			const store = new TicketStore(worktreeDir);
			store.createTicket('T-1', 'Test Ticket');

			expect(() =>
				store.saveTicketContext('t-1-test-ticket', 'notes', value as string)
			).toThrow(TypeError);
		});

		it(`error message for content=${label} mentions "content" and "string"`, async () => {
			const worktreeDir = await createGitWorktree();
			dirs.push(worktreeDir);
			const store = new TicketStore(worktreeDir);
			store.createTicket('T-1', 'Test Ticket');

			let msg = '';
			try {
				store.saveTicketContext('t-1-test-ticket', 'notes', value as string);
			} catch (e) {
				msg = errorMessage(e);
			}
			expect(msg).toContain('content');
			expect(msg).toContain('string');
		});
	}
});

function tmpDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function createGitWorktree(): Promise<string> {
	const dir = tmpDir('context-traversal-test-');
	await git(dir, 'init');
	await git(dir, 'commit', '--allow-empty', '-m', 'init');
	return dir;
}

describe('GET/DELETE with path-traversal name param', () => {
	const dirs: string[] = [];

	afterEach(() => {
		for (const d of dirs) {
			try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { console.warn('cleanup failed', e); }
		}
		dirs.length = 0;
	});

	const traversalNames = ['../secret', '..\\secret', 'foo/../../bar', '..', '.'];

	for (const badName of traversalNames) {
		it(`getTicketContext rejects name="${badName}"`, async () => {
			const worktreeDir = await createGitWorktree();
			dirs.push(worktreeDir);
			const store = new TicketStore(worktreeDir);
			store.createTicket('T-1', 'Test Ticket');

			expect(() => store.getTicketContext('t-1-test-ticket', badName)).toThrow();
		});

		it(`getTicketContext error for name="${badName}" is user-safe`, async () => {
			const worktreeDir = await createGitWorktree();
			dirs.push(worktreeDir);
			const store = new TicketStore(worktreeDir);
			store.createTicket('T-1', 'Test Ticket');

			let msg = '';
			try {
				store.getTicketContext('t-1-test-ticket', badName);
			} catch (e) {
				msg = errorMessage(e);
			}
			expect(msg).toBeTruthy();
			expect(msg).not.toContain('node_modules');
			expect(msg).not.toMatch(/at\s+\w+\s+\(/);
			expect(msg).not.toContain('.ts:');
		});

		it(`deleteTicketContext rejects name="${badName}"`, async () => {
			const worktreeDir = await createGitWorktree();
			dirs.push(worktreeDir);
			const store = new TicketStore(worktreeDir);
			store.createTicket('T-1', 'Test Ticket');

			expect(() => store.deleteTicketContext('t-1-test-ticket', badName)).toThrow();
		});

		it(`deleteTicketContext error for name="${badName}" is user-safe`, async () => {
			const worktreeDir = await createGitWorktree();
			dirs.push(worktreeDir);
			const store = new TicketStore(worktreeDir);
			store.createTicket('T-1', 'Test Ticket');

			let msg = '';
			try {
				store.deleteTicketContext('t-1-test-ticket', badName);
			} catch (e) {
				msg = errorMessage(e);
			}
			expect(msg).toBeTruthy();
			expect(msg).not.toContain('node_modules');
			expect(msg).not.toMatch(/at\s+\w+\s+\(/);
			expect(msg).not.toContain('.ts:');
		});
	}
});
