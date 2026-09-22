import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { makeTempDir, removeTempDir } from '../../test-temp.js';
import { ConfigPaths } from './config-paths.js';
import { ConfigRepository } from './config-repository.js';
import { AppConfigStore } from './app-config-store.js';
import { ProjectRegistry } from '../project/project-registry.js';
import type { AppConfigData } from './app-config-data.js';
import { UpdateLock } from '~/util/update-lock.js';

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
	return { paths, store, registry, config, advance: () => { clock += 101; } };
}

describe('AppConfigStore', () => {
	it('excludes other clients and registry writers until the owner saves', () => {
		const { store, registry, config } = setup();
		expect(store.read('first')).toEqual(config);
		expect(store.read()).toEqual(config);
		expect(() => store.read('second')).toThrow('being updated');
		expect(() => store.write(config, 'second')).toThrow('missing or expired');
		expect(() => registry.setLastUsedProfileName('other')).toThrow('being updated');
		const next = { ...config, lastUsedProfileName: 'saved' };
		expect(store.write(next, 'first')).toEqual(next);
		expect(registry.getLastUsedProfileName()).toBe('saved');
		expect(store.read('second')).toEqual(next);
	});

	it('rejects late saves after expiration without releasing the new owner lock', () => {
		const { store, config, advance } = setup();
		store.read('old');
		advance();
		expect(store.read('new')).toEqual(config);
		expect(() => store.write(config, 'old')).toThrow('missing or expired');
		expect(() => store.read('third')).toThrow('being updated');
		expect(store.write(config, 'new')).toEqual(config);
	});

	it('preserves additional fields through a whole-document update', () => {
		const { store, paths, config } = setup();
		fs.writeFileSync(paths.projectRegistryFile(), JSON.stringify({ ...config, custom: { enabled: true } }));
		const read = store.read('owner');
		store.write({ ...read, browser: 'firefox' }, 'owner');
		expect(JSON.parse(fs.readFileSync(paths.projectRegistryFile(), 'utf8'))).toMatchObject({
			custom: { enabled: true }, browser: 'firefox',
		});
	});

	it('surfaces write errors, retains the file, and releases the lock', () => {
		const { store, paths, config } = setup();
		store.read('owner');
		const parent = path.dirname(paths.projectRegistryFile());
		fs.renameSync(parent, `${parent}-saved`);
		fs.writeFileSync(parent, 'blocked');
		expect(() => store.write(config, 'owner')).toThrow();
		fs.unlinkSync(parent);
		fs.renameSync(`${parent}-saved`, parent);
		expect(store.read('next')).toEqual(config);
		expect(store.read()).toEqual(config);
	});
});
