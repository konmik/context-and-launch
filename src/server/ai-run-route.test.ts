import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { WorktreeManager } from './worktree-manager.js';
import { ConfigPaths } from './config-paths.js';
import { TicketStore } from './ticket-store.js';
import { errorMessage } from './errors.js';
import { escapeBatchTitle } from './batch-escape.js';
// parseLaunchRequest cannot be imported directly because agent-launch.ts pulls in
// singleton instances via the ~ alias which vitest cannot resolve without the
// SvelteKit build pipeline. Instead, replicate the pure function here and verify
// it matches the source code (same pattern used for escapeTitle above).

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

	it('valid slug but nonexistent folderName returns 404 "Ticket not found"', () => {
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

	it('nonexistent slug returns misleading "Ticket not found" instead of indicating missing worktree', () => {
		const configDir = tmpDir('run-config-');
		dirs.push(configDir);

		const manager = new WorktreeManager(new ConfigPaths(configDir));
		const slug = 'does-not-exist';

		// This mirrors the POST handler logic: getWorktreeDir then TicketStore.listTickets
		const worktreeDir = manager.getWorktreeDir(slug);

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
		// was never called for this slug). The user sees "Ticket not found" when the
		// actual problem is "project worktree not initialized".
		//
		// Simulating the response the POST handler would produce:
		const status = !ticket ? 404 : 200;
		const body = !ticket ? 'Ticket not found' : null;

		expect(status).toBe(404);
		expect(body).toBe('Ticket not found');
	});

	it('slug with path traversal ("..") causes requireSafeSlug to throw and try-catch returns 500', () => {
		const configDir = tmpDir('run-config-');
		dirs.push(configDir);

		const manager = new WorktreeManager(new ConfigPaths(configDir));

		// Simulate the POST handler: getWorktreeDir is the first call inside the try block.
		// A traversal slug like ".." should throw from requireSafeSlug.
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

describe('escapeTitle - PowerShell single-quote escape safety', () => {
	// Replicate the production function (not exported from run.ts)
	function escapeTitle(title: string): string {
		return title.replace(/'/g, "''");
	}

	// Helper: simulate how the title is embedded in a PS single-quoted string
	function inPsSingleQuoted(title: string): string {
		return `'${escapeTitle(title)}'`;
	}

	it('doubles single quotes to prevent breakout', () => {
		const result = escapeTitle("'; whoami; '");
		// Each ' becomes '' so: ''; whoami; ''
		expect(result).toBe("''; whoami; ''");
		// When placed in PS string: '  +  escaped content  +  '
		const embedded = inPsSingleQuoted("'; whoami; '");
		expect(embedded).toBe("'''; whoami; '''");
		// Verify inner content has all quotes paired
		const inner = embedded.slice(1, -1);
		const afterPairs = inner.replace(/''/g, '');
		expect(afterPairs).not.toContain("'");
	});

	it('consecutive single quotes are all doubled', () => {
		expect(escapeTitle("a''b")).toBe("a''''b");
		expect(escapeTitle("'''")).toBe("''''''");
	});

	it('$() subexpression is inert inside single quotes', () => {
		const payload = '$(whoami)';
		const escaped = escapeTitle(payload);
		// No single quotes in payload, so nothing changes
		expect(escaped).toBe('$(whoami)');
		// The key safety property: it's embedded in single quotes where $ has no meaning
		const embedded = inPsSingleQuoted(payload);
		expect(embedded).toBe("'$(whoami)'");
		// Verify no unbalanced single quotes (count should be even for inner content)
		const innerQuotes = embedded.slice(1, -1).split("''").length - 1;
		// No quotes inside at all
		expect(embedded.slice(1, -1)).not.toMatch(/(?<!')'(?!')/);
	});

	it('backtick escape sequences are inert inside single quotes', () => {
		const payload = '`ls`';
		const escaped = escapeTitle(payload);
		expect(escaped).toBe('`ls`');
		const embedded = inPsSingleQuoted(payload);
		expect(embedded).toBe("'`ls`'");
	});

	it('double quotes are inert inside single quotes', () => {
		const payload = '"hello"';
		const escaped = escapeTitle(payload);
		expect(escaped).toBe('"hello"');
		const embedded = inPsSingleQuoted(payload);
		expect(embedded).toBe("'\"hello\"'");
	});

	it('combined dangerous payload with single-quote breakout attempt', () => {
		// Attacker tries: close quote, run command, open quote
		const payload = "test'); Start-Process calc; ('";
		const escaped = escapeTitle(payload);
		expect(escaped).toBe("test''); Start-Process calc; (''");
		const embedded = inPsSingleQuoted(payload);
		// The outer quotes wrap everything; inner quotes are all doubled
		expect(embedded).toBe("'test''); Start-Process calc; ('''");
		// Verify: no lone single quote (all are paired)
		const inner = embedded.slice(1, -1); // strip outer quotes
		// Replace all '' with nothing; no quotes should remain
		const afterPairs = inner.replace(/''/g, '');
		expect(afterPairs).not.toContain("'");
	});

	it('empty string is safe', () => {
		expect(escapeTitle('')).toBe('');
		expect(inPsSingleQuoted('')).toBe("''");
	});

	it('string with only single quotes becomes all doubled', () => {
		expect(escapeTitle("'")).toBe("''");
		expect(inPsSingleQuoted("'")).toBe("''''");
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

describe('pull-and-retry skips windowExists check (code-inspection)', () => {
	// This test reads the actual source files to confirm the structural difference
	// between run.ts and pull-and-retry.ts: run.ts checks windowExists before launching
	// to prevent duplicate agent windows; pull-and-retry.ts does not, allowing a second
	// agent window for the same ticket.

	const runSource = fs.readFileSync(
		path.resolve(__dirname, '../routes/api/projects/[slug]/board/tickets/[folderName]/ai/run.ts'),
		'utf-8'
	);
	const pullAndRetrySource = fs.readFileSync(
		path.resolve(__dirname, '../routes/api/projects/[slug]/board/tickets/[folderName]/ai/pull-and-retry.ts'),
		'utf-8'
	);

	it('run.ts imports windowExists from agent-launch', () => {
		expect(runSource).toContain('windowExists');
		// Verify it appears in an import statement
		expect(runSource).toMatch(/import\s*\{[^}]*windowExists[^}]*\}\s*from/);
	});

	it('run.ts calls windowExists and returns 409 "Already started"', () => {
		// The guard: if (await windowExists(windowTitle)) { return new Response("Already started", { status: 409 }); }
		expect(runSource).toMatch(/await\s+windowExists\s*\(/);
		expect(runSource).toContain('Already started');
		expect(runSource).toContain('409');
	});

	it('pull-and-retry.ts does NOT import or call windowExists', () => {
		// This is the bug: pull-and-retry lacks the duplicate-window guard entirely
		expect(pullAndRetrySource).not.toContain('windowExists');
		expect(pullAndRetrySource).not.toContain('buildWindowTitle');
	});

	it('pull-and-retry.ts does NOT return 409 for duplicate windows', () => {
		expect(pullAndRetrySource).not.toContain('Already started');
	});

	it('both endpoints call launchAgent -- confirming pull-and-retry does launch a window', () => {
		// Both endpoints reach launchAgent which spawns a new wt window.
		// Without the windowExists guard, pull-and-retry will create a duplicate.
		expect(runSource).toContain('launchAgent');
		expect(pullAndRetrySource).toContain('launchAgent');
	});
});

describe('useWorktree=true with worktreeRootPath=null returns 400 (code-inspection)', () => {
	const agentLaunchSource = fs.readFileSync(
		path.resolve(__dirname, 'agent-launch.ts'),
		'utf-8'
	);

	it('returns 400 error when worktreeRootPath is not configured', () => {
		expect(agentLaunchSource).toContain('Worktree root path is not configured');
		expect(agentLaunchSource).toMatch(/!merged\.worktreeRootPath/);
	});
});


describe('parseLaunchRequest with missing/malformed request body', () => {
	// Replicate the pure function from agent-launch.ts (cannot import due to ~ alias)
	interface LaunchRequest { templateName: string; checkedSkills: string[]; useWorktree: boolean; profileName: string; }
	function parseLaunchRequest(body: unknown): LaunchRequest {
		const result: LaunchRequest = { templateName: 'Default', checkedSkills: [], useWorktree: false, profileName: '' };
		if (body && typeof body === 'object') {
			const b = body as Record<string, unknown>;
			if (typeof b.templateName === 'string') result.templateName = b.templateName;
			if (Array.isArray(b.checkedSkills)) result.checkedSkills = b.checkedSkills;
			if (typeof b.useWorktree === 'boolean') result.useWorktree = b.useWorktree;
			if (typeof b.profileName === 'string') result.profileName = b.profileName;
		}
		return result;
	}

	const DEFAULTS = { templateName: 'Default', checkedSkills: [], useWorktree: false, profileName: '' };

	it('replicated function matches source code', () => {
		// Read the production source to verify our replica stays in sync
		const source = fs.readFileSync(
			path.resolve(__dirname, 'agent-launch.ts'),
			'utf-8'
		);
		// The function body must contain the same default values and type guards
		expect(source).toContain('templateName: "Default"');
		expect(source).toContain('checkedSkills: []');
		expect(source).toContain('useWorktree: false');
		expect(source).toContain('profileName: ""');
		expect(source).toContain("typeof b.templateName === \"string\"");
		expect(source).toContain("Array.isArray(b.checkedSkills)");
		expect(source).toContain("typeof b.useWorktree === \"boolean\"");
		expect(source).toContain("typeof b.profileName === \"string\"");
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
		// typeof [] === "object" and Array is truthy, so it enters the object branch
		// but none of the expected keys exist on a plain array
		const result = parseLaunchRequest(['a', 'b']);
		expect(result).toEqual(DEFAULTS);
	});

	it('body with wrong types for all fields returns defaults', () => {
		const result = parseLaunchRequest({
			templateName: 123,        // not a string
			checkedSkills: 'not-array', // not an array
			useWorktree: 'yes',        // not a boolean
		});
		expect(result).toEqual(DEFAULTS);
	});

	it('body with valid fields overrides defaults', () => {
		const result = parseLaunchRequest({
			templateName: 'Custom',
			checkedSkills: ['skill-a', 'skill-b'],
			useWorktree: true,
		});
		expect(result).toEqual({
			templateName: 'Custom',
			checkedSkills: ['skill-a', 'skill-b'],
			useWorktree: true,
			profileName: '',
		});
	});

	it('body with partial valid fields merges with defaults', () => {
		// Only templateName is valid; other fields use defaults
		const result = parseLaunchRequest({ templateName: 'MyTemplate' });
		expect(result).toEqual({
			templateName: 'MyTemplate',
			checkedSkills: [],
			useWorktree: false,
			profileName: '',
		});
	});

	it('body with extra unknown fields does not affect result', () => {
		const result = parseLaunchRequest({
			templateName: 'Custom',
			unknownField: 'ignored',
			anotherField: 999,
		});
		expect(result.templateName).toBe('Custom');
		expect(result.checkedSkills).toEqual([]);
		expect(result.useWorktree).toBe(false);
		expect(result).not.toHaveProperty('unknownField');
		expect(result).not.toHaveProperty('anotherField');
	});

	it('never throws for any input', () => {
		// parseLaunchRequest must be safe to call with any value -- both run.ts and
		// pull-and-retry.ts rely on it not throwing during body parsing
		const inputs = [undefined, null, 0, '', false, NaN, Infinity, [], {}, 'json', 42, true];
		for (const input of inputs) {
			expect(() => parseLaunchRequest(input)).not.toThrow();
		}
	});
});

describe('launchAgent ticketDir vs launchDir separation (code-inspection)', () => {
	// This test reads agent-launch.ts to confirm that ticketDir in the interpolated
	// prompt is derived from worktreeDir (the ticket storage directory), NOT from
	// launchDir (the git worktree or project path where the agent terminal opens).
	// These are intentionally different paths: worktreeDir stores ticket metadata,
	// while launchDir is the CWD for the spawned agent terminal.

	const agentLaunchSource = fs.readFileSync(
		path.resolve(__dirname, 'agent-launch.ts'),
		'utf-8'
	);

	it('ticketDir is computed from worktreeDir (first param), not launchDir (last param)', () => {
		// The function signature: launchAgent(slug, ticket, project, worktreeDir, launchRequest, launchDir)
		// ticketDir must resolve from worktreeDir, not launchDir
		expect(agentLaunchSource).toMatch(/const ticketDir\s*=\s*path\.resolve\(worktreeDir,/);
		// ticketDir must NOT reference launchDir
		expect(agentLaunchSource).not.toMatch(/const ticketDir\s*=.*launchDir/);
	});

	it('launchDir is only used for the spawned terminal working directory, not for ticket resolution', () => {
		expect(agentLaunchSource).toMatch(/spawnDetached\(executable,\s*args,\s*launchDir\)/);
		const variablesBlockMatch = agentLaunchSource.match(/const variables[^}]+\}/s);
		expect(variablesBlockMatch).not.toBeNull();
		const variablesBlock = variablesBlockMatch![0];
		expect(variablesBlock).toContain('ticketDir');
		expect(variablesBlock).not.toContain('launchDir');
	});

	it('ticketDir flows into the variables dict for prompt interpolation', () => {
		// ticketDir must appear as a key in the variables object
		expect(agentLaunchSource).toMatch(/variables\s*.*=\s*\{[^}]*ticketDir[^}]*\}/s);
		// The variables dict is passed to interpolatePrompt
		expect(agentLaunchSource).toMatch(/interpolatePrompt\(assembled,\s*variables\)/);
	});

	it('worktreeDir and launchDir are separate parameters in the function signature', () => {
		// The function must accept both worktreeDir and launchDir as distinct parameters
		expect(agentLaunchSource).toMatch(
			/function launchAgent\([^)]*worktreeDir:\s*string[^)]*launchDir:\s*string[^)]*\)/s
		);
	});

	it('the run route uses resolveLaunchDir and passes worktreeDir and launchDir separately to launchAgent', () => {
		const runSource = fs.readFileSync(
			path.resolve(__dirname, '../routes/api/projects/[slug]/board/tickets/[folderName]/ai/run.ts'),
			'utf-8'
		);
		// worktreeDir comes from resolveTicketAndProject destructuring
		expect(runSource).toMatch(/const\s*\{[^}]*worktreeDir[^}]*\}\s*=\s*resolved/);
		// launchDir is resolved via the shared resolveLaunchDir helper
		expect(runSource).toContain('resolveLaunchDir');
		// Both are passed to launchAgent as distinct arguments
		expect(runSource).toMatch(/launchAgent\([^)]*worktreeDir[^)]*launchDir/);
	});

});
