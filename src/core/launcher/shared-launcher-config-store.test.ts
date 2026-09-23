import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { makeTempDir, removeTempDir } from '../../test-temp.js';
import { ConfigPaths } from '../config/config-paths.js';
import { ConfigRepository } from '../config/config-repository.js';
import { SharedLauncherConfigStore } from './shared-launcher-config-store.js';
import { LauncherConfigManager } from './launcher-config.js';
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(removeTempDir)); });

function setup() {
	const directory = makeTempDir('shared-launcher-config-');
	directories.push(directory);
	const paths = new ConfigPaths(directory);
	const repository = new ConfigRepository();
	const store = new SharedLauncherConfigStore(paths, repository);
	store.write({ templates: [], skills: [], profiles: [] });
	return { paths, store, manager: new LauncherConfigManager(paths, repository, store) };
}

describe('shared launcher storage', () => {
	it('coordinates client updates and manager writes through the same lease', () => {
		const { store, manager } = setup();
		const current = store.read('first');
		expect(manager.loadAppConfig()).toEqual(current);
		expect(() => store.read('second')).toThrow('being updated');
		expect(() => manager.saveAppConfig(current)).toThrow('being updated');
		store.write({ ...current, skills: [{ name: 'saved', text: 'text' }] }, 'first');
		expect(manager.loadAppConfig().skills).toEqual([{ name: 'saved', text: 'text' }]);
	});

	it('preserves extra fields and shared references without mutating the input', () => {
		const { store, paths } = setup();
		fs.writeFileSync(paths.appLauncherConfigFile(), JSON.stringify({
			templates: [], skills: [{ name: 'old', text: 'text', order: 4, custom: true }],
			custom: { enabled: true },
			columnDefaults: { todo: {
				templateName: null, profileName: null, checkedSkills: ['old'], skillOrder: ['old'], custom: true,
			} },
		}));
		const current = store.read('owner');
		const saved = store.write({
			...current,
			skills: current.skills.map(skill => ({ ...skill, name: 'new', text: 'updated' })),
		}, 'owner');
		expect(current.skills[0].name).toBe('old');
		expect(current.columnDefaults?.todo.checkedSkills).toEqual(['old']);
		expect(saved).toMatchObject({
			custom: { enabled: true }, skills: [{ name: 'new', text: 'updated', order: 4, custom: true }],
			columnDefaults: { todo: { checkedSkills: ['old'], skillOrder: ['old'], custom: true } },
		});
		expect(store.read()).toEqual(saved);
	});

	it('releases the lease after validation and write failures while retaining the file', () => {
		const { store, paths } = setup();
		const current = store.read('invalid');
		expect(() => store.write({
			...current, skills: [{ name: 'bad', text: '', order: Infinity }],
		}, 'invalid')).toThrow();
		expect(store.read('disk')).toEqual(current);
		const parent = path.dirname(paths.appLauncherConfigFile());
		fs.renameSync(parent, `${parent}-saved`);
		fs.writeFileSync(parent, 'blocked');
		expect(() => store.write(current, 'disk')).toThrow();
		fs.unlinkSync(parent);
		fs.renameSync(`${parent}-saved`, parent);
		expect(store.read('next')).toEqual(current);
	});
});
