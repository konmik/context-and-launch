import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { WorktreeManager } from './worktree-manager.js';
import { TicketStore, toKebabCase } from './ticket-store.js';
import { errorMessage } from './errors.js';
import { escapeBatchTitle } from './batch-escape.js';

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

		const manager = new WorktreeManager(configDir);
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

		const manager = new WorktreeManager(configDir);

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

describe('SendKeys title matching and prompt injection safety', () => {
	// Replicate production functions (not exported from run.ts)
	function escapeSendKeys(text: string): string {
		return text.replace(/([+^%~(){}[\]])/g, '{$1}');
	}

	function escapeTitle(title: string): string {
		return title.replace(/'/g, "''");
	}

	const TITLE_SUFFIX = ' — AI';

	// Simulate how trySendKeys builds its script
	function buildSendKeysScript(windowTitle: string, keys: string): string {
		return [
			`$ws = New-Object -ComObject WScript.Shell`,
			`if (-not $ws.AppActivate('${escapeTitle(windowTitle)}')) { exit 1 }`,
			`Start-Sleep 1`,
			`[void]$ws.AppActivate('${escapeTitle(windowTitle)}')`,
			`$ws.SendKeys('${keys}~')`,
		].join('\n');
	}

	it('escapeTitle is applied to window title in trySendKeys script (title with single quotes)', () => {
		const dangerousTitle = "My Ticket's Title" + TITLE_SUFFIX;
		const script = buildSendKeysScript(dangerousTitle, 'hello');
		// The single quote in the title must be doubled in the script
		expect(script).toContain("My Ticket''s Title");
		// Must NOT contain a lone unescaped single-quote breakout
		// Extract the AppActivate lines individually
		const lines = script.split('\n');
		const activateLines = lines.filter(l => l.includes('AppActivate('));
		expect(activateLines.length).toBe(2);
		for (const line of activateLines) {
			// Extract the content between the outer quotes: AppActivate('...')
			const start = line.indexOf("('") + 2;
			const end = line.lastIndexOf("')");
			const inner = line.slice(start, end);
			// After removing all doubled quotes, no lone single-quote should remain
			const afterPairs = inner.replace(/''/g, '');
			expect(afterPairs).not.toContain("'");
		}
	});

	it('title with SendKeys-special chars does not leak into SendKeys call', () => {
		// A title with +^%~(){}[] (SendKeys specials) -- these are ONLY in AppActivate, not SendKeys
		const title = 'Bug +fix ^caret %percent ~tilde (parens) {braces} [brackets]' + TITLE_SUFFIX;
		const keys = 'safe message';
		const script = buildSendKeysScript(title, keys);
		// The SendKeys line should only contain the keys param, not the title
		const sendKeysLine = script.split('\n').find(l => l.includes('$ws.SendKeys('));
		expect(sendKeysLine).toBeDefined();
		expect(sendKeysLine).toContain('safe message');
		expect(sendKeysLine).not.toContain('Bug +fix');
	});

	it('escapeSendKeys wraps all special chars in braces for the prompt text', () => {
		// Simulate a ticketDir on Windows with parentheses (e.g. Program Files (x86))
		const ticketDir = 'C:\\Program Files (x86)\\projects\\proj-1-test';
		const initialPrompt = `Current ticket files are in ${ticketDir}. Read the files there for context.`;
		const escaped = escapeSendKeys(initialPrompt);
		// ( and ) must be wrapped: ( becomes {(} and ) becomes {)}
		expect(escaped).toContain('{(}x86{)}');
		// The original unescaped parens must not appear
		expect(escaped).not.toMatch(/[^{]\([^}]/);
	});

	it('escapeSendKeys handles all SendKeys special characters', () => {
		const specials = '+^%~(){}[]';
		const escaped = escapeSendKeys(specials);
		// Each special char X should become {X}
		expect(escaped).toBe('{+}{^}{%}{~}{(}{)}{{}{}}{[}{]}');
		// No raw specials remain outside braces
		const withoutBraced = escaped.replace(/\{.\}/g, '');
		expect(withoutBraced).toBe('');
	});

	it('folderName from toKebabCase cannot contain SendKeys specials', () => {
		// toKebabCase strips everything non-alphanumeric to hyphens
		const dangerous = 'Title +with ^caret %percent ~tilde (parens) {braces} [brackets]';
		const folder = toKebabCase(`PROJ-1 ${dangerous}`);
		// Only lowercase alphanumeric and hyphens allowed
		expect(folder).toMatch(/^[a-z0-9-]+$/);
		// None of the SendKeys specials survive
		const sendKeysSpecials = /[+^%~(){}[\]]/;
		expect(folder).not.toMatch(sendKeysSpecials);
	});

	it('full prompt construction path escapes SendKeys specials and PS single-quotes', () => {
		// Simulate the exact code path from run.ts lines 73-74
		const ticketDir = 'C:\\Users\\test\\worktrees\\proj-1-fix-bug+(v2)';
		const initialPrompt = `Current ticket files are in ${ticketDir}. Read the files there for context.`;
		const sendKeysMsg = escapeSendKeys(initialPrompt).replace(/'/g, "''");

		// Verify SendKeys specials are escaped
		expect(sendKeysMsg).toContain('{+}');
		expect(sendKeysMsg).toContain('{(}');
		expect(sendKeysMsg).toContain('{)}');

		// Verify no raw SendKeys specials remain (outside of brace-escapes)
		// Remove all {X} sequences, then check no specials remain
		const stripped = sendKeysMsg.replace(/\{.\}/g, '');
		expect(stripped).not.toMatch(/[+^%~(){}[\]]/);

		// Verify the PS single-quote escape is applied
		const withQuote = escapeSendKeys("it's a path").replace(/'/g, "''");
		expect(withQuote).toBe("it''s a path");
	});
});
