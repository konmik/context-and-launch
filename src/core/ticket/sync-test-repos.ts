import fs from 'fs';
import path from 'path';
import { git, gitSync, setGitOriginUrl } from '~/test-git.js';
import {
	makeTempDir, removeTempDirOrWarn, lazyTemplate, cloneFromTemplate,
} from '~/test-temp.js';
import { TicketSyncManager } from './ticket-sync.js';
import { GitRepository } from '../infra/git-repository.js';
import { createTestCommandTemplateService } from '../command-template/command-template.test-utils.js';

export { makeTempDir as tmpDir };

export function createTicketSyncManager(): TicketSyncManager {
	const commands = createTestCommandTemplateService();
	return new TicketSyncManager(commands, new GitRepository(commands));
}

const getNoUpstreamTemplate = lazyTemplate(() => {
	const bareDir = makeTempDir('sync-orphan-bare-tpl-');
	gitSync(bareDir, 'init', '--bare');

	const seedDir = makeTempDir('sync-orphan-seed-tpl-');
	gitSync(seedDir, 'init');
	fs.writeFileSync(path.join(seedDir, 'remote-only.txt'), 'from remote');
	fs.writeFileSync(path.join(seedDir, 'shared.txt'), 'shared');
	gitSync(seedDir, 'add', '-A');
	gitSync(seedDir, 'commit', '-m', 'seed');
	gitSync(seedDir, 'remote', 'add', 'origin', bareDir);
	gitSync(seedDir, 'push', '-u', 'origin', 'master');

	const worktreeDir = makeTempDir('sync-orphan-worktree-tpl-');
	gitSync(worktreeDir, 'init');
	fs.writeFileSync(path.join(worktreeDir, 'shared.txt'), 'shared');
	fs.writeFileSync(path.join(worktreeDir, 'local-only.txt'), 'from local');
	gitSync(worktreeDir, 'add', '-A');
	gitSync(worktreeDir, 'commit', '-m', 'local init');
	gitSync(worktreeDir, 'remote', 'add', 'origin', bareDir);

	return { bareDir, worktreeDir };
});

export function createNoUpstreamRepoWithExistingRemoteBranch(
	dirs: string[],
): { worktreeDir: string; remoteDir: string } {
	const template = getNoUpstreamTemplate();
	const remoteDir = cloneFromTemplate(template.bareDir, 'sync-remote-orphan-');
	const worktreeDir = cloneFromTemplate(template.worktreeDir, 'sync-orphan-');
	setGitOriginUrl(worktreeDir, remoteDir);
	dirs.push(remoteDir, worktreeDir);
	return { worktreeDir, remoteDir };
}

export function cleanup(...dirs: string[]): Promise<void> {
	return Promise.all(dirs.map((d) => removeTempDirOrWarn(d))).then(() => undefined);
}

const getRemoteRepoTemplate = lazyTemplate(() => {
	const bareDir = makeTempDir('sync-remote-tpl-');
	gitSync(bareDir, 'init', '--bare');
	const worktreeDir = makeTempDir('sync-worktree-tpl-');
	gitSync(worktreeDir, 'init');
	gitSync(worktreeDir, 'commit', '--allow-empty', '-m', 'init');
	gitSync(worktreeDir, 'remote', 'add', 'origin', bareDir);
	gitSync(worktreeDir, 'push', '-u', 'origin', 'master');
	return { bareDir, worktreeDir };
});

export function createRepoWithRemote(): { worktreeDir: string; remoteDir: string } {
	const template = getRemoteRepoTemplate();
	const remoteDir = cloneFromTemplate(template.bareDir, 'sync-remote-');
	const worktreeDir = cloneFromTemplate(template.worktreeDir, 'sync-worktree-');
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
	const clone2 = makeTempDir('sync-clone2-');
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
