import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { makeTempDir, removeTempDir } from '../../test-temp.js';
import { ConfigPaths } from './config-paths.js';
import { ConfigRepository } from './config-repository.js';
import { AppConfigStore } from './app-config-store.js';
import { ProjectRegistry } from '../project/project-registry.js';
import type { AppConfigData } from './app-config-data.js';
import { UpdateLock } from '~/util/update-lock.js';
import { createStoredConfig } from '~/util/stored-config.js';
import { succeed } from '~/util/result.js';

const directories: string[] = [];
afterEach(async () => {
	await Promise.all(directories.splice(0).map(directory => removeTempDir(directory)));
});

function setup() {
	const directory = makeTempDir('app-config-');
	directories.push(directory);
	const paths = new ConfigPaths(directory);
	const repository = new ConfigRepository();
	const config: AppConfigData = { projects: [], lastUsedProjectSlug: null, lastUsedProfileName: null };
	repository.writeJson(paths.projectRegistryFile(), config);
	let clock = 0;
	const store = new AppConfigStore(paths, repository, new UpdateLock(100, () => clock));
	const registry = new ProjectRegistry(paths, repository, store);
	return { paths, repository, store, registry, config, advance: () => { clock += 101; } };
}

describe('AppConfigStore', () => {
	it('excludes other clients and registry writers until the owner saves', () => {
		const { store, registry, config } = setup();
		expect(store.read('first')).toEqual(config);
		expect(store.read()).toEqual(config);
		expect(() => store.read('second')).toThrow('being updated');
		expect(() => store.update(() => config, 'second')).toThrow('missing or expired');
		expect(() => registry.removeProject('other')).toThrow('being updated');
		const next = { ...config, lastUsedProfileName: 'saved' };
		expect(store.update(() => next, 'first')).toEqual(next);
		expect(store.read().lastUsedProfileName).toBe('saved');
		expect(store.read('second')).toEqual(next);
	});

	it('rejects late saves after expiration without releasing the new owner lock', () => {
		const { store, config, advance } = setup();
		store.read('old');
		advance();
		expect(store.read('new')).toEqual(config);
		expect(() => store.update(() => config, 'old')).toThrow('missing or expired');
		expect(() => store.read('third')).toThrow('being updated');
		expect(store.update(() => config, 'new')).toEqual(config);
	});

	it('preserves additional fields through a whole-document update', () => {
		const { store, paths, config } = setup();
		fs.writeFileSync(paths.projectRegistryFile(), JSON.stringify({ ...config, custom: { enabled: true } }));
		const read = store.read('owner');
		store.update(() => ({ ...read, browser: 'firefox' }), 'owner');
		expect(JSON.parse(fs.readFileSync(paths.projectRegistryFile(), 'utf8'))).toMatchObject({
			custom: { enabled: true }, browser: 'firefox',
		});
	});

	it('surfaces write errors, retains the file, and releases the lock', () => {
		const { store, repository, config } = setup();
		store.read('owner');
		vi.spyOn(repository, 'writeJson').mockImplementationOnce(() => { throw new Error('write failed'); });
		expect(() => store.update(current => ({ ...current, browser: 'unsaved' }), 'owner')).toThrow('write failed');
		expect(store.read('next')).toEqual(config);
		expect(store.read()).toEqual(config);
	});

	it('releases failed client updates and saves the next transform against current disk contents', async () => {
		const { store, paths, config } = setup();
		let transportFailed = false;
		const storage = createStoredConfig(
			async owner => succeed(store.read(owner)),
			async (json, owner) => {
				if (!transportFailed) {
					transportFailed = true;
					throw new Error('connection lost');
				}
				return succeed(store.update(() => JSON.parse(json), owner));
			},
			async owner => store.release(owner),
		);
		expect(await storage.update(() => { throw new Error('invalid edit'); }))
			.toEqual({ type: 'Failure', error: 'invalid edit' });
		expect(await storage.update(current => ({ ...current, browser: 'unsaved' })))
			.toEqual({ type: 'Failure', error: 'connection lost' });
		expect(store.read()).toEqual(config);
		fs.writeFileSync(paths.projectRegistryFile(), JSON.stringify({ ...config, browser: 'external', custom: true }));
		expect(await storage.update(current => ({ ...current, lastUsedProfileName: 'saved' })))
			.toEqual(succeed(undefined));
		expect(storage.get()).toMatchObject({ browser: 'external', custom: true, lastUsedProfileName: 'saved' });
		expect(store.read('another-client')).toEqual(storage.get());
	});

	it('serializes optional field removal and retains the lock after an unrelated release', async () => {
		const { store } = setup();
		store.update(current => ({ ...current, browser: 'firefox' }));
		store.read('first');
		store.release('other');
		expect(() => store.read('second')).toThrow('being updated');
		store.release('first');
		const storage = createStoredConfig(
			async owner => succeed(store.read(owner)),
			async (json, owner) => succeed(store.update(() => JSON.parse(json), owner)),
			async owner => store.release(owner),
		);
		expect(await storage.update(current => ({ ...current, browser: undefined }))).toEqual(succeed(undefined));
		expect(store.read()).not.toHaveProperty('browser');
	});
});
