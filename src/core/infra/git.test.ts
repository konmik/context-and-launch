import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { git, gitSync } from '~/test-git.js';

function tmpDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanup(...dirs: string[]) {
	for (const d of dirs) {
		try {
			fs.rmSync(d, { recursive: true, force: true });
		} catch (err) {
			console.warn(`cleanup ${d}: ${err instanceof Error ? err.message : String(err)}`);
		}
	}
}

async function createRepo(dirs: string[]): Promise<string> {
	const dir = tmpDir('git-wrapper-');
	dirs.push(dir);
	await git(dir, 'init');
	return dir;
}

describe('git wrapper argument fidelity', () => {
	const dirs: string[] = [];
	afterEach(() => { cleanup(...dirs); dirs.length = 0; });

	it('git preserves a trailing-backslash arg without merging it into the next arg', async () => {
		const dir = await createRepo(dirs);
		const out = await git(dir, 'rev-parse', '--sq-quote', 'C:\\tickets\\', 'next');
		expect(out.trim()).toBe("'C:\\tickets\\' 'next'");
	});

	it('gitSync preserves a trailing-backslash arg without merging it into the next arg', async () => {
		const dir = await createRepo(dirs);
		const out = gitSync(dir, 'rev-parse', '--sq-quote', 'C:\\tickets\\', 'next');
		expect(out.trim()).toBe("'C:\\tickets\\' 'next'");
	});

	it('git passes %VAR% sequences literally without environment expansion', async () => {
		const dir = await createRepo(dirs);
		const out = await git(dir, 'rev-parse', '--sq-quote', 'before %OS% after');
		expect(out.trim()).toBe("'before %OS% after'");
	});

	it('git preserves a trailing-backslash path arg in a real subcommand', async () => {
		const dir = await createRepo(dirs);
		await git(dir, 'commit', '--allow-empty', '-m', 'path C:\\tickets\\', '-m', 'body');
		const subject = await git(dir, 'log', '-1', '--format=%s');
		expect(subject.trim()).toBe('path C:\\tickets\\');
	});
});

describe('git wrapper spawn failure', () => {
	it('git surfaces the spawn error reason when the process produces no output', async () => {
		const missing = path.join(os.tmpdir(), `git-wrapper-missing-${Date.now()}`);
		await expect(git(missing, 'status')).rejects.toThrow(/ENOENT/);
	});
});
