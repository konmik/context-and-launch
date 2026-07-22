import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { git } from '~/test-git.js';
import { setAppLogListener } from '../infra/app-logger.js';
import {
	tmpDir, cleanup, createRepoWithRemote, conflictResolveDir, pushRemoteConflict,
	createTicketSyncManager,
} from './sync-test-repos.js';

describe('TicketSyncManager resolution', () => {
	const dirs: string[] = [];
	afterAll(() => { cleanup(...dirs); dirs.length = 0; });

	it.concurrent('prepareResolution rebases in a scratch worktree, never touching the live tree', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir, conflictResolveDir(worktreeDir));

		await pushRemoteConflict(remoteDir, dirs);
		fs.writeFileSync(path.join(worktreeDir, 'conflict.txt'), 'local content');

		const manager = createTicketSyncManager();
		expect((await manager.sync(worktreeDir)).status).toBe('conflict');
		const liveHead = (await git(worktreeDir, 'rev-parse', 'HEAD')).trim();

		const plan = await manager.prepareResolution(worktreeDir);
		expect(plan.needsAgent).toBe(true);
		expect(plan.scratchDir).toBe(conflictResolveDir(worktreeDir));
		expect(manager.isResolving(worktreeDir)).toBe(true);

		// The rebase is in the scratch worktree; the live tree is untouched.
		expect(manager.hasActiveRebase(plan.scratchDir)).toBe(true);
		expect(manager.hasActiveRebase(worktreeDir)).toBe(false);
		expect((await git(worktreeDir, 'rev-parse', 'HEAD')).trim()).toBe(liveHead);
		expect(fs.readFileSync(path.join(worktreeDir, 'conflict.txt'), 'utf-8')).toBe('local content');
	});

	it('finalizeResolution advances the live tree to the pushed result and removes the scratch',
		async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir, conflictResolveDir(worktreeDir));

		await pushRemoteConflict(remoteDir, dirs);
		fs.writeFileSync(path.join(worktreeDir, 'conflict.txt'), 'local content');

		const manager = createTicketSyncManager();
		await manager.sync(worktreeDir);
		const plan = await manager.prepareResolution(worktreeDir);

		// Simulate the agent resolving and pushing inside the scratch worktree.
		fs.writeFileSync(path.join(plan.scratchDir, 'conflict.txt'), 'merged content');
		await git(plan.scratchDir, 'add', '-A');
		await git(plan.scratchDir, 'rebase', '--continue');
		await git(plan.scratchDir, 'push', 'origin', 'HEAD:master');

		expect(await manager.finalizeResolution(worktreeDir)).toBe(true);
		expect(manager.isResolving(worktreeDir)).toBe(false);
		expect(fs.existsSync(plan.scratchDir)).toBe(false);

		// Live tree now matches the pushed upstream, with the merged content.
		expect(fs.readFileSync(path.join(worktreeDir, 'conflict.txt'), 'utf-8')).toBe('merged content');
		const head = (await git(worktreeDir, 'rev-parse', 'HEAD')).trim();
		const upstream = (await git(worktreeDir, 'rev-parse', 'origin/master')).trim();
		expect(head).toBe(upstream);
		expect((await git(worktreeDir, 'status', '--porcelain')).trim()).toBe('');
	});

	it('finalizeResolution preserves a ticket edit made in the live tree during resolution', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir, conflictResolveDir(worktreeDir));

		fs.writeFileSync(path.join(worktreeDir, 'ticket.txt'), 'v1');
		await git(worktreeDir, 'add', '-A');
		await git(worktreeDir, 'commit', '-m', 'add ticket');
		await git(worktreeDir, 'push');

		await pushRemoteConflict(remoteDir, dirs);
		fs.writeFileSync(path.join(worktreeDir, 'conflict.txt'), 'local content');

		const manager = createTicketSyncManager();
		await manager.sync(worktreeDir);
		const plan = await manager.prepareResolution(worktreeDir);

		fs.writeFileSync(path.join(plan.scratchDir, 'conflict.txt'), 'merged content');
		await git(plan.scratchDir, 'add', '-A');
		await git(plan.scratchDir, 'rebase', '--continue');
		await git(plan.scratchDir, 'push', 'origin', 'HEAD:master');

		fs.writeFileSync(path.join(worktreeDir, 'ticket.txt'), 'edited during resolution');

		expect(await manager.finalizeResolution(worktreeDir)).toBe(true);
		expect(manager.isResolving(worktreeDir)).toBe(false);

		expect(fs.readFileSync(path.join(worktreeDir, 'ticket.txt'), 'utf-8')).toBe('edited during resolution');
		expect(fs.readFileSync(path.join(worktreeDir, 'conflict.txt'), 'utf-8')).toBe('merged content');
		expect((await git(worktreeDir, 'status', '--porcelain')).trim()).toBe('');
		expect(await git(remoteDir, 'show', 'master:ticket.txt')).toBe('edited during resolution');

		const second = await manager.sync(worktreeDir);
		expect(second.status).toBe('success');
	});

	it.concurrent('isResolving reports false once the scratch rebase is resolved, even before the dir is removed',
		async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir, conflictResolveDir(worktreeDir));

		await pushRemoteConflict(remoteDir, dirs);
		fs.writeFileSync(path.join(worktreeDir, 'conflict.txt'), 'local content');

		const manager = createTicketSyncManager();
		await manager.sync(worktreeDir);
		const plan = await manager.prepareResolution(worktreeDir);
		expect(manager.isResolving(worktreeDir)).toBe(true);

		// Agent resolves the rebase but the scratch worktree is not yet finalized/removed.
		fs.writeFileSync(path.join(plan.scratchDir, 'conflict.txt'), 'merged content');
		await git(plan.scratchDir, 'add', '-A');
		await git(plan.scratchDir, 'rebase', '--continue');

		expect(manager.hasActiveRebase(plan.scratchDir)).toBe(false);
		expect(fs.existsSync(plan.scratchDir)).toBe(true);
		expect(manager.isResolving(worktreeDir)).toBe(false);
	});

	it.concurrent('sync returns conflict while a resolution is pending in the scratch worktree', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir, conflictResolveDir(worktreeDir));

		await pushRemoteConflict(remoteDir, dirs);
		fs.writeFileSync(path.join(worktreeDir, 'conflict.txt'), 'local content');

		const manager = createTicketSyncManager();
		await manager.sync(worktreeDir);
		await manager.prepareResolution(worktreeDir);

		expect((await manager.sync(worktreeDir)).status).toBe('conflict');
	});

	it.concurrent('abort removes the scratch worktree and leaves the live tree untouched', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir, conflictResolveDir(worktreeDir));

		await pushRemoteConflict(remoteDir, dirs);
		fs.writeFileSync(path.join(worktreeDir, 'conflict.txt'), 'local content');

		const manager = createTicketSyncManager();
		await manager.sync(worktreeDir);
		const liveHead = (await git(worktreeDir, 'rev-parse', 'HEAD')).trim();
		const plan = await manager.prepareResolution(worktreeDir);

		await manager.abort(worktreeDir);
		expect(fs.existsSync(plan.scratchDir)).toBe(false);
		expect(manager.isResolving(worktreeDir)).toBe(false);
		expect((await git(worktreeDir, 'rev-parse', 'HEAD')).trim()).toBe(liveHead);
		expect(fs.readFileSync(path.join(worktreeDir, 'conflict.txt'), 'utf-8')).toBe('local content');
	});

	it.concurrent('sync preserves a ticket edit written while the push is in flight', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir);

		fs.writeFileSync(path.join(worktreeDir, 'ticket.txt'), 'v1');
		await git(worktreeDir, 'add', '-A');
		await git(worktreeDir, 'commit', '-m', 'add ticket');
		await git(worktreeDir, 'push');

		fs.writeFileSync(path.join(worktreeDir, 'ticket.txt'), 'v2');

		const worktreePosix = worktreeDir.replace(/\\/g, '/');
		const markerPosix = `${remoteDir.replace(/\\/g, '/')}/hook-ran`;
		const hookPath = path.join(remoteDir, 'hooks', 'pre-receive');
		fs.writeFileSync(
			hookPath,
			`#!/bin/sh\nprintf 'concurrent edit' > "${worktreePosix}/ticket.txt"\n`
			+ `printf 'yes' > "${markerPosix}"\nexit 0\n`,
		);
		fs.chmodSync(hookPath, 0o755);

		const manager = createTicketSyncManager();
		const result = await manager.sync(worktreeDir);

		expect(fs.existsSync(path.join(remoteDir, 'hook-ran'))).toBe(true);
		expect(result.status).toBe('success');
		expect(fs.readFileSync(path.join(worktreeDir, 'ticket.txt'), 'utf-8')).toBe('concurrent edit');

		fs.rmSync(hookPath);
		const second = await manager.sync(worktreeDir);
		expect(second.status).toBe('success');
		expect(await git(remoteDir, 'show', 'master:ticket.txt')).toBe('concurrent edit');
		expect((await git(worktreeDir, 'status', '--porcelain')).trim()).toBe('');
	});

	it('sync preserves a ticket edit landing right before the fast-forward to a moved upstream', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir);

		fs.writeFileSync(path.join(worktreeDir, 'ticket.txt'), 'v1');
		await git(worktreeDir, 'add', '-A');
		await git(worktreeDir, 'commit', '-m', 'add ticket');
		await git(worktreeDir, 'push');

		await pushRemoteConflict(remoteDir, dirs);

		const manager = createTicketSyncManager();
		let injected = false;
		setAppLogListener((_cat, _msg, context) => {
			if (!injected && (
				context?.commandTemplateKey === 'ticket-sync.reset-hard'
				|| context?.commandTemplateKey === 'ticket-sync.fast-forward'
			)) {
				injected = true;
				fs.writeFileSync(path.join(worktreeDir, 'ticket.txt'), 'concurrent edit');
			}
		});
		try {
			const result = await manager.sync(worktreeDir);
			expect(result.status).toBe('success');
		} finally {
			setAppLogListener(undefined);
		}

		expect(injected).toBe(true);
		expect(fs.readFileSync(path.join(worktreeDir, 'ticket.txt'), 'utf-8')).toBe('concurrent edit');
		expect(fs.readFileSync(path.join(worktreeDir, 'conflict.txt'), 'utf-8')).toBe('remote content');

		const second = await manager.sync(worktreeDir);
		expect(second.status).toBe('success');
		expect(await git(remoteDir, 'show', 'master:ticket.txt')).toBe('concurrent edit');
		expect((await git(worktreeDir, 'status', '--porcelain')).trim()).toBe('');
	});

	it.concurrent('prepareResolution pushes and finalizes without an agent when the rebase is clean', async () => {
		const { worktreeDir, remoteDir } = await createRepoWithRemote();
		dirs.push(worktreeDir, remoteDir, conflictResolveDir(worktreeDir));

		// Local commit and a non-conflicting remote commit on a different file.
		fs.writeFileSync(path.join(worktreeDir, 'local.txt'), 'local');
		await git(worktreeDir, 'add', '-A');
		await git(worktreeDir, 'commit', '-m', 'sync: local changes');

		const clone2 = tmpDir('sync-clone2-');
		dirs.push(clone2);
		await git(clone2, 'clone', remoteDir, '.');
		fs.writeFileSync(path.join(clone2, 'remote.txt'), 'remote');
		await git(clone2, 'add', '-A');
		await git(clone2, 'commit', '-m', 'remote change');
		await git(clone2, 'push');

		const manager = createTicketSyncManager();
		const plan = await manager.prepareResolution(worktreeDir);

		expect(plan.needsAgent).toBe(false);
		expect(fs.existsSync(plan.scratchDir)).toBe(false);
		expect(fs.existsSync(path.join(worktreeDir, 'local.txt'))).toBe(true);
		expect(fs.existsSync(path.join(worktreeDir, 'remote.txt'))).toBe(true);
	});
});
