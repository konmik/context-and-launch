import fs from 'fs';
import path from 'path';
import os from 'os';
import { git, gitSync, setGitOriginUrl } from '~/test-git.js';
import { TicketSyncManager } from './ticket-sync.js';
import { GitRepository } from '../infra/git-repository.js';
import { createTestCommandTemplateService } from '../command-template/command-template.test-utils.js';

export function tmpDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function createTicketSyncManager(): TicketSyncManager {
	const commands = createTestCommandTemplateService();
	return new TicketSyncManager(commands, new GitRepository(commands));
}

let noUpstreamTemplate: { bareDir: string; worktreeDir: string } | undefined;

function getNoUpstreamTemplate(): { bareDir: string; worktreeDir: string } {
	if (!noUpstreamTemplate) {
		const bareDir = tmpDir('sync-orphan-bare-tpl-');
		gitSync(bareDir, 'init', '--bare');

		const seedDir = tmpDir('sync-orphan-seed-tpl-');
		gitSync(seedDir, 'init');
		fs.writeFileSync(path.join(seedDir, 'remote-only.txt'), 'from remote');
		fs.writeFileSync(path.join(seedDir, 'shared.txt'), 'shared');
		gitSync(seedDir, 'add', '-A');
		gitSync(seedDir, 'commit', '-m', 'seed');
		gitSync(seedDir, 'remote', 'add', 'origin', bareDir);
		gitSync(seedDir, 'push', '-u', 'origin', 'master');

		const worktreeDir = tmpDir('sync-orphan-worktree-tpl-');
		gitSync(worktreeDir, 'init');
		fs.writeFileSync(path.join(worktreeDir, 'shared.txt'), 'shared');
		fs.writeFileSync(path.join(worktreeDir, 'local-only.txt'), 'from local');
		gitSync(worktreeDir, 'add', '-A');
		gitSync(worktreeDir, 'commit', '-m', 'local init');
		gitSync(worktreeDir, 'remote', 'add', 'origin', bareDir);

		noUpstreamTemplate = { bareDir, worktreeDir };
	}
	return noUpstreamTemplate;
}

export function createNoUpstreamRepoWithExistingRemoteBranch(
	dirs: string[],
): { worktreeDir: string; remoteDir: string } {
	const template = getNoUpstreamTemplate();
	const remoteDir = tmpDir('sync-remote-orphan-');
	fs.cpSync(template.bareDir, remoteDir, { recursive: true });
	const worktreeDir = tmpDir('sync-orphan-');
	fs.cpSync(template.worktreeDir, worktreeDir, { recursive: true });
	setGitOriginUrl(worktreeDir, remoteDir);
	dirs.push(remoteDir, worktreeDir);
	return { worktreeDir, remoteDir };
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

let remoteRepoTemplate: { bareDir: string; worktreeDir: string } | undefined;

function getRemoteRepoTemplate(): { bareDir: string; worktreeDir: string } {
	if (!remoteRepoTemplate) {
		const bareDir = tmpDir('sync-remote-tpl-');
		gitSync(bareDir, 'init', '--bare');
		const worktreeDir = tmpDir('sync-worktree-tpl-');
		gitSync(worktreeDir, 'init');
		gitSync(worktreeDir, 'commit', '--allow-empty', '-m', 'init');
		gitSync(worktreeDir, 'remote', 'add', 'origin', bareDir);
		gitSync(worktreeDir, 'push', '-u', 'origin', 'master');
		remoteRepoTemplate = { bareDir, worktreeDir };
	}
	return remoteRepoTemplate;
}

export function createRepoWithRemote(): { worktreeDir: string; remoteDir: string } {
	const template = getRemoteRepoTemplate();
	const remoteDir = tmpDir('sync-remote-');
	fs.cpSync(template.bareDir, remoteDir, { recursive: true });
	const worktreeDir = tmpDir('sync-worktree-');
	fs.cpSync(template.worktreeDir, worktreeDir, { recursive: true });
	setGitOriginUrl(worktreeDir, remoteDir);
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
