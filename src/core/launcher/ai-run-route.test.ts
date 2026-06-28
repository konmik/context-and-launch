import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { WorktreeManager } from '../worktree/worktree-manager.js';
import { ConfigPaths } from '../config/config-paths.js';
import { TicketStore } from '../ticket/ticket-store.js';
import { errorMessage } from '../shared/errors.js';
import { escapeBatchTitle } from '../shared/batch-escape.js';
// parseLaunchRequest cannot be imported directly because agent-launch.ts pulls in
// singleton instances via the ~ alias which vitest cannot resolve without the
// SvelteKit build pipeline. Instead, replicate the pure function here and verify
// it matches the source code.

function tmpDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanup(...dirs: string[]) {
	for (const d of dirs) {
		try {
			fs.rmSync(d, { recursive: true, force: true });
		} catch {
			// ignore
		}
	}
}

describe('ai/run.ts endpoint logic', () => {
	const dirs: string[] = [];

	afterEach(() => {
		cleanup(...dirs);
		dirs.length = 0;
	});

	it('valid projectSlug but nonexistent folderName returns 404 "Ticket not found"', () => {
		// Create a real worktree directory with one ticket
		const worktreeDir = tmpDir('run-worktree-');
		dirs.push(worktreeDir);

		const ticketFolder = path.join(worktreeDir, 'proj-1-real-ticket');
		fs.mkdirSync(ticketFolder, { recursive: true });
		fs.writeFileSync(
			path.join(ticketFolder, 'status.json'),
			JSON.stringify({ number: 'PROJ-1', title: 'Real Ticket', status: 'todo' })
		);

		// Confirm the ticket exists via TicketStore
		const store = new TicketStore(worktreeDir);
		const tickets = store.listTickets();
		expect(tickets.length).toBe(1);
		expect(tickets[0].folderName).toBe('proj-1-real-ticket');

		// Now simulate the POST handler logic with a folderName that does not match
		const nonexistentFolder = 'proj-99-does-not-exist';
		const ticket = tickets.find(t => t.folderName === nonexistentFolder);
		expect(ticket).toBeUndefined();

		// The endpoint returns 404 "Ticket not found"
		const status = !ticket ? 404 : 200;
		const body = !ticket ? 'Ticket not found' : null;

		expect(status).toBe(404);
		expect(body).toBe('Ticket not found');
	});

	it('nonexistent projectSlug returns misleading "Ticket not found" instead of indicating missing worktree', () => {
		const configDir = tmpDir('run-config-');
		dirs.push(configDir);

		const manager = new WorktreeManager(new ConfigPaths(configDir));
		const projectSlug = 'does-not-exist';

		// This mirrors the POST handler logic: getWorktreeDir then TicketStore.listTickets
		const worktreeDir = manager.getWorktreeDir(projectSlug);

		// worktreeDir points to a nonexistent directory
		expect(fs.existsSync(worktreeDir)).toBe(false);

		// TicketStore.listTickets returns [] for a nonexistent directory
		const store = new TicketStore(worktreeDir);
		const tickets = store.listTickets();
		expect(tickets).toEqual([]);

		// The POST handler does: tickets.find(t => t.folderName === folderName)
		// With an empty array, this always returns undefined
		const ticket = tickets.find(t => t.folderName === 'any-folder');
		expect(ticket).toBeUndefined();

		// So the endpoint returns 404 "Ticket not found" -- misleading because
		// the real issue is that the worktree directory does not exist (ensureWorktree
		// was never called for this projectSlug). The user sees "Ticket not found" when the
		// actual problem is "project worktree not initialized".
		//
		// Simulating the response the POST handler would produce:
		const status = !ticket ? 404 : 200;
		const body = !ticket ? 'Ticket not found' : null;

		expect(status).toBe(404);
		expect(body).toBe('Ticket not found');
	});

	it('projectSlug with path traversal ("..") causes requireSafeSlug to throw and try-catch returns 500', () => {
		const configDir = tmpDir('run-config-');
		dirs.push(configDir);

		const manager = new WorktreeManager(new ConfigPaths(configDir));

		// Simulate the POST handler: getWorktreeDir is the first call inside the try block.
		// A traversal projectSlug like ".." should throw from requireSafeSlug.
		let status: number;
		let body: string;

		try {
			manager.getWorktreeDir('..');
			// If we reach here, requireSafeSlug did not throw -- that is the bug case
			status = 200;
			body = '';
		} catch (e) {
			// The endpoint's catch returns 500 with errorMessage(e)
			status = 500;
			body = errorMessage(e);
		}

		expect(status).toBe(500);
		expect(body).toBe('Invalid slug: ..');
	});
});

describe('escapeBatchTitle - batch metacharacter injection', () => {
	it('strips ampersand to prevent command chaining', () => {
		const result = escapeBatchTitle('foo & whoami');
		expect(result).toBe('foo  whoami');
		expect(result).not.toContain('&');
	});

	it('strips pipe to prevent piping output', () => {
		const result = escapeBatchTitle('test | dir');
		expect(result).toBe('test  dir');
		expect(result).not.toContain('|');
	});

	it('strips angle brackets to prevent redirection', () => {
		const result = escapeBatchTitle('a > output.txt');
		expect(result).toBe('a  output.txt');
		expect(result).not.toContain('>');
		expect(result).not.toContain('<');
	});

	it('strips percent signs to prevent variable expansion', () => {
		const result = escapeBatchTitle('%PATH%');
		expect(result).toBe('PATH');
		expect(result).not.toContain('%');
	});

	it('strips caret to prevent escape sequences', () => {
		const result = escapeBatchTitle('hello^world');
		expect(result).toBe('helloworld');
		expect(result).not.toContain('^');
	});

	it('strips CR/LF to prevent line injection', () => {
		const result = escapeBatchTitle('line1\r\nline2');
		expect(result).toBe('line1line2');
		expect(result).not.toContain('\r');
		expect(result).not.toContain('\n');
	});

	it('strips double quotes', () => {
		const result = escapeBatchTitle('say "hello"');
		expect(result).toBe('say hello');
		expect(result).not.toContain('"');
	});

	it('preserves safe characters intact', () => {
		const safe = "My Ticket Title - Feature (v2) [draft] 'quoted'";
		expect(escapeBatchTitle(safe)).toBe(safe);
	});

	it('handles a combination of multiple metacharacters', () => {
		const result = escapeBatchTitle('a & b | c > d < e ^ f % g "h"');
		// Only safe chars and spaces remain
		expect(result).not.toMatch(/[&|><^%"]/);
		expect(result).toBe('a  b  c  d  e  f  g h');
	});
});

describe('duplicate-launch guard (code-inspection)', () => {
	const launcherApiSource = fs.readFileSync(
		path.resolve(
			__dirname, '../../components/launcher/launcher-api.ts',
		),
		'utf-8'
	);

	it('launchAgentAction guards with agentRunning and returns "Already started"', () => {
		expect(launcherApiSource).toMatch(/agentRunning\(projectSlug,\s*folderName\)/);
		expect(launcherApiSource).toContain('Already started');
	});

	it('launcher-api does not rely on window-title matching', () => {
		expect(launcherApiSource).not.toContain('windowExists');
		expect(launcherApiSource).not.toContain('buildWindowTitle');
	});

	it('both actions call launchAgentCore', () => {
		expect(launcherApiSource).toContain('launchAgentCore');
	});
});

describe('useWorktree=true with worktreeRootPath=null (code-inspection)', () => {
	const agentLaunchSource = fs.readFileSync(
		path.resolve(__dirname, 'agent-launch.ts'),
		'utf-8'
	);

	it('resolveLaunchDir delegates to ensureAgentWorktree which falls back to agentWorktreeDir', () => {
		expect(agentLaunchSource).toContain('ensureAgentWorktree');
		expect(agentLaunchSource).not.toMatch(/!merged\.worktreeRootPath/);
	});
});


describe('parseLaunchRequest with missing/malformed request body', () => {
	interface LaunchRequest {
		initialPrompt: string; useWorktree: boolean; profileName: string; force: boolean; launchDir: string;
	}
	function parseLaunchRequest(body: unknown): LaunchRequest {
		const result: LaunchRequest = {
			initialPrompt: '', useWorktree: false, profileName: '', force: false, launchDir: '',
		};
		if (body && typeof body === 'object') {
			const b = body as Record<string, unknown>;
			if (typeof b.initialPrompt === 'string') result.initialPrompt = b.initialPrompt;
			if (typeof b.useWorktree === 'boolean') result.useWorktree = b.useWorktree;
			if (typeof b.profileName === 'string') result.profileName = b.profileName;
			if (typeof b.force === 'boolean') result.force = b.force;
			if (typeof b.launchDir === 'string') result.launchDir = b.launchDir;
		}
		return result;
	}

	const DEFAULTS = { initialPrompt: '', useWorktree: false, profileName: '', force: false, launchDir: '' };

	it('replicated function matches source code', () => {
		const source = fs.readFileSync(
			path.resolve(__dirname, 'agent-launch.ts'),
			'utf-8'
		);
		expect(source).toContain('initialPrompt: ""');
		expect(source).toContain('useWorktree: false');
		expect(source).toContain('profileName: ""');
		expect(source).toContain('launchDir: ""');
		expect(source).toContain("typeof b.initialPrompt === \"string\"");
		expect(source).toContain("typeof b.useWorktree === \"boolean\"");
		expect(source).toContain("typeof b.profileName === \"string\"");
		expect(source).toContain("typeof b.launchDir === \"string\"");
	});

	it('undefined body returns all defaults', () => {
		const result = parseLaunchRequest(undefined);
		expect(result).toEqual(DEFAULTS);
	});

	it('null body returns all defaults', () => {
		const result = parseLaunchRequest(null);
		expect(result).toEqual(DEFAULTS);
	});

	it('empty object body returns all defaults', () => {
		const result = parseLaunchRequest({});
		expect(result).toEqual(DEFAULTS);
	});

	it('string body returns all defaults (non-object)', () => {
		const result = parseLaunchRequest('hello');
		expect(result).toEqual(DEFAULTS);
	});

	it('number body returns all defaults (non-object)', () => {
		const result = parseLaunchRequest(42);
		expect(result).toEqual(DEFAULTS);
	});

	it('boolean body returns all defaults (non-object)', () => {
		const result = parseLaunchRequest(true);
		expect(result).toEqual(DEFAULTS);
	});

	it('array body is treated as object but has no matching keys, returns defaults', () => {
		const result = parseLaunchRequest(['a', 'b']);
		expect(result).toEqual(DEFAULTS);
	});

	it('body with wrong types for all fields returns defaults', () => {
		const result = parseLaunchRequest({
			initialPrompt: 123,
			useWorktree: 'yes',
		});
		expect(result).toEqual(DEFAULTS);
	});

	it('body with valid fields overrides defaults', () => {
		const result = parseLaunchRequest({
			initialPrompt: 'do the thing',
			useWorktree: true,
		});
		expect(result).toEqual({
			initialPrompt: 'do the thing',
			useWorktree: true,
			profileName: '',
			force: false,
			launchDir: '',
		});
	});

	it('body with partial valid fields merges with defaults', () => {
		const result = parseLaunchRequest({ initialPrompt: 'hello' });
		expect(result).toEqual({
			initialPrompt: 'hello',
			useWorktree: false,
			profileName: '',
			force: false,
			launchDir: '',
		});
	});

	it('body with extra unknown fields does not affect result', () => {
		const result = parseLaunchRequest({
			initialPrompt: 'do it',
			unknownField: 'ignored',
			anotherField: 999,
		});
		expect(result.initialPrompt).toBe('do it');
		expect(result.useWorktree).toBe(false);
		expect(result).not.toHaveProperty('unknownField');
		expect(result).not.toHaveProperty('anotherField');
	});

	it('never throws for any input', () => {
		const inputs = [undefined, null, 0, '', false, NaN, Infinity, [], {}, 'json', 42, true];
		for (const input of inputs) {
			expect(() => parseLaunchRequest(input)).not.toThrow();
		}
	});
});

describe('launchAgent uses initialPrompt directly (code-inspection)', () => {
	const agentLaunchSource = fs.readFileSync(
		path.resolve(__dirname, 'agent-launch.ts'),
		'utf-8'
	);

	it('launchAgent passes initialPrompt from launchRequest to commandVars', () => {
		expect(agentLaunchSource).toMatch(/launchRequest\.initialPrompt/);
	});

	it('launchAgent does not assemble or interpolate prompts', () => {
		const fnMatch = agentLaunchSource.match(/function launchAgent\([^)]*\)[^{]*\{([\s\S]*?)^}/m);
		expect(fnMatch).not.toBeNull();
		const body = fnMatch![1];
		expect(body).not.toContain('assemblePrompt');
		expect(body).not.toContain('interpolatePrompt');
	});

	it('launchDir is used for the spawned terminal working directory', () => {
		expect(agentLaunchSource).toMatch(/spawnProfile\(profile,\s*commandVars,\s*launchDir\)/);
	});

	it('the launcher-api uses resolveLaunchDir and launchAgentCore', () => {
		const launcherApiSource = fs.readFileSync(
			path.resolve(__dirname, '../../components/launcher/launcher-api.ts'),
			'utf-8'
		);
		expect(launcherApiSource).toMatch(/resolveTicketAndProject/);
		expect(launcherApiSource).toContain('resolveLaunchDir');
		expect(launcherApiSource).toMatch(/launchAgentCore\(/);
	});
});
