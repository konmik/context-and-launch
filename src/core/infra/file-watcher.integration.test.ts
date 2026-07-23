import { afterAll, describe, expect, it, vi } from 'vitest';
import chokidar from 'chokidar';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTestCommandTemplateService } from '../command-template/command-template.test-utils.js';
import { git } from '../../test-git.js';
import {
	FileWatcher,
	type FileWatcherAdapters,
} from './file-watcher.js';

const dirs: string[] = [];

function tempDir(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-watcher-integration-'));
	dirs.push(dir);
	return dir;
}

async function initialize(dir: string): Promise<void> {
	await git(dir, 'init');
	fs.writeFileSync(path.join(dir, 'initial.txt'), 'initial');
	await git(dir, 'add', '-A');
	await git(dir, 'commit', '-m', 'initial commit');
}

async function waitFor(
	predicate: () => boolean | Promise<boolean>,
	timeoutMs = 5000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!await predicate()) {
		if (Date.now() >= deadline) throw new Error('Timed out waiting for file-watcher condition');
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

function realAdapters(onReady: () => void): FileWatcherAdapters {
	return {
		createWatcher: (dir, options) => {
			const watcher = chokidar.watch(dir, options);
			watcher.on('ready', onReady);
			return watcher;
		},
		setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
		clearTimer: (timer) => clearTimeout(timer),
	};
}

afterAll(() => {
	for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('FileWatcher real chokidar contract', () => {
	it('observes real add/change events, commits them, and excludes dot-only changes', async () => {
		const dir = tempDir();
		await initialize(dir);
		let ready = false;
		const onChange = vi.fn();
		const watcher = new FileWatcher(
			createTestCommandTemplateService(),
			onChange,
			realAdapters(() => { ready = true; }),
		);
		try {
			watcher.watch(dir, 20);
			await waitFor(() => ready);

			const observed = path.join(dir, 'observed.txt');
			fs.writeFileSync(observed, 'added');
			await waitFor(async () => (await git(dir, 'log', '--oneline')).includes('auto: external changes'));
			fs.writeFileSync(observed, 'changed');
			await waitFor(async () => (await git(dir, 'log', '--oneline')).trim().split('\n').length === 3);

			const callsAfterVisibleChanges = onChange.mock.calls.length;
			fs.writeFileSync(path.join(dir, '.hidden'), 'ignored');
			fs.mkdirSync(path.join(dir, '.cache'));
			fs.writeFileSync(path.join(dir, '.cache', 'entry.txt'), 'ignored');
			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(onChange).toHaveBeenCalledWith(dir);
			expect(onChange.mock.calls).toHaveLength(callsAfterVisibleChanges);
			expect((await git(dir, 'status', '--porcelain'))).toContain('.hidden');
		} finally {
			watcher.stopAll();
		}
	});

	it('restart creates a fresh observer and watching a second directory is additive', async () => {
		const dirA = tempDir();
		const dirB = tempDir();
		await initialize(dirA);
		await initialize(dirB);
		const ready = new Set<string>();
		const adapters: FileWatcherAdapters = {
			createWatcher: (dir, options) => {
				const handle = chokidar.watch(dir, options);
				handle.on('ready', () => ready.add(dir));
				return handle;
			},
			setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
			clearTimer: (timer) => clearTimeout(timer),
		};
		const watcher = new FileWatcher(createTestCommandTemplateService(), undefined, adapters);
		try {
			watcher.watch(dirA, 20);
			await waitFor(() => ready.has(dirA));
			watcher.stop(dirA);
			ready.delete(dirA);
			watcher.watch(dirA, 20);
			watcher.watch(dirB, 20);
			await waitFor(() => ready.has(dirA) && ready.has(dirB));

			fs.writeFileSync(path.join(dirA, 'after-restart.txt'), 'A');
			fs.writeFileSync(path.join(dirB, 'additive.txt'), 'B');
			await waitFor(async () => (
				(await git(dirA, 'log', '--oneline')).includes('auto: external changes')
				&& (await git(dirB, 'log', '--oneline')).includes('auto: external changes')
			));

			expect(await git(dirA, 'status', '--porcelain')).toBe('');
			expect(await git(dirB, 'status', '--porcelain')).toBe('');
		} finally {
			watcher.stopAll();
		}
	});
});
