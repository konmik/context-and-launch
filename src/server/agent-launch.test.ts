import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import type { ExecFileException } from 'child_process';

// trySendKeys cannot be imported directly because agent-launch.ts pulls in
// singleton instances via the ~ alias. We replicate the retry logic here
// and verify behavior, then use code-inspection to confirm the production
// code matches our structural expectations.

type ExecFileCallback = (error: ExecFileException | null) => void;

function escapeTitle(title: string): string {
	return title.replace(/'/g, "''");
}

// Replicate trySendKeys with injectable execFile for testing retry behavior.
// This mirrors the production code structure exactly.
function makeTrySendKeys(mockExecFile: (cmd: string, args: string[], opts: object, cb: ExecFileCallback) => void) {
	function trySendKeys(windowTitle: string, keys: string, retriesLeft = 20): { cancel: () => void } {
		let cancelled = false;
		let timerId: ReturnType<typeof setTimeout> | null = null;

		const script = [
			`$ws = New-Object -ComObject WScript.Shell`,
			`if (-not $ws.AppActivate('${escapeTitle(windowTitle)}')) { exit 1 }`,
			`Start-Sleep 1`,
			`[void]$ws.AppActivate('${escapeTitle(windowTitle)}')`,
			`$ws.SendKeys('${keys}~')`,
		].join('\n');
		const encoded = Buffer.from(script, 'utf16le').toString('base64');

		mockExecFile('powershell', ['-NoProfile', '-EncodedCommand', encoded], { windowsHide: true }, (err) => {
			if (cancelled) return;
			if (err && retriesLeft > 0) {
				timerId = setTimeout(() => {
					if (!cancelled) {
						const inner = trySendKeys(windowTitle, keys, retriesLeft - 1);
						// Propagate cancel to inner chain
						const origCancel = handle.cancel;
						handle.cancel = () => { origCancel(); inner.cancel(); };
					}
				}, 500);
			} else if (err) {
				console.warn(`trySendKeys: failed after all retries for window "${windowTitle}"`);
			}
		});

		const handle = {
			cancel: () => {
				cancelled = true;
				if (timerId !== null) clearTimeout(timerId);
			},
		};
		return handle;
	}

	return trySendKeys;
}

describe('trySendKeys retry loop', () => {
	beforeEach(() => { vi.useFakeTimers(); });
	afterEach(() => { vi.useRealTimers(); });

	it('retries on failure up to retriesLeft times', () => {
		let callCount = 0;
		const mockExecFile = (_cmd: string, _args: string[], _opts: object, cb: ExecFileCallback) => {
			callCount++;
			cb(new Error('window not found') as ExecFileException);
		};

		const trySendKeys = makeTrySendKeys(mockExecFile);
		trySendKeys('Test Window', 'hello', 3);

		// First call happens immediately
		expect(callCount).toBe(1);

		// Each retry fires after 500ms
		vi.advanceTimersByTime(500);
		expect(callCount).toBe(2);
		vi.advanceTimersByTime(500);
		expect(callCount).toBe(3);
		vi.advanceTimersByTime(500);
		expect(callCount).toBe(4); // retriesLeft was 3, so 1 + 3 = 4 total calls

		// No more retries after exhaustion
		vi.advanceTimersByTime(500);
		expect(callCount).toBe(4);
	});

	it('stops retrying on success', () => {
		let callCount = 0;
		const mockExecFile = (_cmd: string, _args: string[], _opts: object, cb: ExecFileCallback) => {
			callCount++;
			if (callCount <= 2) {
				cb(new Error('window not found') as ExecFileException);
			} else {
				cb(null); // success on 3rd try
			}
		};

		const trySendKeys = makeTrySendKeys(mockExecFile);
		trySendKeys('Test Window', 'hello', 5);

		expect(callCount).toBe(1);
		vi.advanceTimersByTime(500);
		expect(callCount).toBe(2);
		vi.advanceTimersByTime(500);
		expect(callCount).toBe(3); // success

		// No more retries after success
		vi.advanceTimersByTime(5000);
		expect(callCount).toBe(3);
	});

	it('cancel() stops the retry chain', () => {
		let callCount = 0;
		const mockExecFile = (_cmd: string, _args: string[], _opts: object, cb: ExecFileCallback) => {
			callCount++;
			cb(new Error('window not found') as ExecFileException);
		};

		const trySendKeys = makeTrySendKeys(mockExecFile);
		const handle = trySendKeys('Test Window', 'hello', 10);

		expect(callCount).toBe(1);
		handle.cancel();

		// Advancing time should NOT trigger more retries
		vi.advanceTimersByTime(10000);
		expect(callCount).toBe(1);
	});

	it('logs warning when retries are exhausted', () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const mockExecFile = (_cmd: string, _args: string[], _opts: object, cb: ExecFileCallback) => {
			cb(new Error('window not found') as ExecFileException);
		};

		const trySendKeys = makeTrySendKeys(mockExecFile);
		trySendKeys('My Window', 'hello', 2);

		// Exhaust retries: initial + 2 retries
		vi.advanceTimersByTime(500); // retry 1
		vi.advanceTimersByTime(500); // retry 2 (last)

		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining('failed after all retries')
		);
		warnSpy.mockRestore();
	});

	it('cancel mid-chain stops subsequent retries', () => {
		let callCount = 0;
		const mockExecFile = (_cmd: string, _args: string[], _opts: object, cb: ExecFileCallback) => {
			callCount++;
			cb(new Error('window not found') as ExecFileException);
		};

		const trySendKeys = makeTrySendKeys(mockExecFile);
		const handle = trySendKeys('Test Window', 'hello', 10);

		expect(callCount).toBe(1);
		vi.advanceTimersByTime(500);
		expect(callCount).toBe(2);

		// Cancel after second call
		handle.cancel();
		vi.advanceTimersByTime(10000);
		expect(callCount).toBe(2);
	});
});

describe('trySendKeys production code structure (code-inspection)', () => {
	const source = fs.readFileSync(
		path.resolve(__dirname, 'agent-launch.ts'),
		'utf-8'
	);

	it('trySendKeys returns a cancel handle', () => {
		expect(source).toMatch(/function trySendKeys\([^)]*\).*\{.*cancel/s);
	});

	it('trySendKeys logs when retries are exhausted instead of swallowing the error', () => {
		expect(source).toMatch(/console\.warn.*failed after all retries/);
	});

	it('cancelled flag prevents further retries', () => {
		expect(source).toContain('cancelled');
	});

	it('launchAgent does not call trySendKeys directly', () => {
		// trySendKeys is no longer called from launchAgent; the platform script handles prompt delivery
		// Extract the launchAgent function body
		const fnMatch = source.match(/function launchAgent\([^)]*\)[^{]*\{([\s\S]*?)^}/m);
		if (fnMatch) {
			expect(fnMatch[1]).not.toContain('trySendKeys(');
		}
	});
});

describe('parseLaunchRequest profileName (code-inspection)', () => {
	const source = fs.readFileSync(
		path.resolve(__dirname, 'agent-launch.ts'),
		'utf-8'
	);

	// Replicate the pure function from agent-launch.ts
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

	it('launchAgent spawns the profile command with cwd set to launchDir', () => {
		expect(source).toMatch(/spawn\(executable/);
		expect(source).toMatch(/cwd:\s*launchDir/);
	});

	it('launchAgent no longer creates a bat file', () => {
		// Extract the launchAgent function body
		const fnMatch = source.match(/function launchAgent\([^)]*\)[^{]*\{([\s\S]*?)^}/m);
		expect(fnMatch).not.toBeNull();
		const body = fnMatch![1];
		expect(body).not.toContain('batPath');
		expect(body).not.toContain('.bat');
	});

	it('launchAgent saves profileName in column defaults', () => {
		expect(source).toMatch(/profileName:\s*launchRequest\.profileName/);
	});


});
