import fs from 'fs';
import path from 'path';
import os from 'os';
import { git } from '../infra/git.js';

export function tmpDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function cleanup(...dirs: string[]) {
	for (const d of dirs) {
		try {
			fs.rmSync(d, { recursive: true, force: true });
		} catch (err) {
			console.warn(`cleanup ${d}: ${err instanceof Error ? err.message : String(err)}`);
		}
	}
}

export async function createRepoWithRemote(): Promise<{ worktreeDir: string; remoteDir: string }> {
	const remoteDir = tmpDir('sync-remote-');
	await git(remoteDir, 'init', '--bare');

	const worktreeDir = tmpDir('sync-worktree-');
	await git(worktreeDir, 'init');
	await git(worktreeDir, 'config', 'user.email', 'test@test.com');
	await git(worktreeDir, 'config', 'user.name', 'Test');
	await git(worktreeDir, 'config', 'core.editor', 'true');
	await git(worktreeDir, 'commit', '--allow-empty', '-m', 'init');
	await git(worktreeDir, 'remote', 'add', 'origin', remoteDir);
	await git(worktreeDir, 'push', '-u', 'origin', 'master');

	return { worktreeDir, remoteDir };
}

export function conflictResolveDir(worktreeDir: string): string {
	return path.join(path.dirname(worktreeDir), `${path.basename(worktreeDir)}-conflict-resolve`);
}

export async function pushRemoteConflict(
	remoteDir: string,
	dirs: string[],
	extraFiles: Record<string, string> = {},
): Promise<void> {
	const clone2 = tmpDir('sync-clone2-');
	dirs.push(clone2);
	await git(clone2, 'clone', remoteDir, '.');
	await git(clone2, 'config', 'user.email', 'test@test.com');
	await git(clone2, 'config', 'user.name', 'Test');
	fs.writeFileSync(path.join(clone2, 'conflict.txt'), 'remote content');
	for (const [relPath, content] of Object.entries(extraFiles)) {
		const filePath = path.join(clone2, relPath);
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, content);
	}
	await git(clone2, 'add', '-A');
	await git(clone2, 'commit', '-m', 'remote change');
	await git(clone2, 'push');
}
