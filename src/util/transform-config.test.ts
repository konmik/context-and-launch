import { describe, it, expect } from 'vitest';
import { transformConfig } from './transform-config.js';
import { UpdateLock } from './update-lock.js';
import { succeed } from './result.js';

describe('transformConfig', () => {
	it('releases failed transforms and failed requests so the next update can persist', async () => {
		const lock = new UpdateLock();
		let json = JSON.stringify({ value: 'saved', optional: 'remove' });
		const read = async (owner: string) => succeed(lock.read((): { value: string; optional?: string } =>
			JSON.parse(json), owner));
		const release = async (owner: string) => { lock.release(owner); };
		const save = async (next: string, owner: string) => succeed(lock.write(() => {
			json = next;
			return JSON.parse(next);
		}, owner));
		expect(await transformConfig(() => { throw new Error('invalid'); }, read, save, release))
			.toEqual({ type: 'Failure', error: 'invalid' });
		expect(await transformConfig(current => current, read, async () => {
			throw new Error('request failed');
		}, release)).toEqual({ type: 'Failure', error: 'request failed' });
		expect(JSON.parse(json)).toEqual({ value: 'saved', optional: 'remove' });
		expect(await transformConfig(current => ({ ...current, optional: undefined }), read, save, release))
			.toEqual({ type: 'Success', value: { value: 'saved' } });
		expect(JSON.parse(json)).toEqual({ value: 'saved' });
	});
});
