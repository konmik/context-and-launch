import { describe, it, expect, vi } from 'vitest';
import { createStoredConfig } from './stored-config.js';
import { UpdateLock } from './update-lock.js';
import { succeed } from './result.js';

describe('stored config', () => {
	it('releases failed transforms and failed requests so the next update can persist', async () => {
		const lock = new UpdateLock();
		let json = JSON.stringify({ value: 'saved', optional: 'remove' });
		const read = async (owner?: string) => succeed(lock.read((): { value: string; optional?: string } =>
			JSON.parse(json), owner));
		const release = async (owner: string) => { lock.release(owner); };
		const save = vi.fn(async (next: string, owner: string) => succeed(lock.write(() => {
			json = next;
			return JSON.parse(next);
		}, owner)));
		const storage = createStoredConfig(read, save, release);
		expect(await storage.update(() => { throw new Error('invalid'); }))
			.toEqual({ type: 'Failure', error: 'invalid' });
		save.mockImplementationOnce(async () => {
			throw new Error('request failed');
		});
		expect(await storage.update(current => current)).toEqual({ type: 'Failure', error: 'request failed' });
		expect(JSON.parse(json)).toEqual({ value: 'saved', optional: 'remove' });
		expect(await storage.update(current => ({ ...current, optional: undefined })))
			.toEqual(succeed(undefined));
		expect(JSON.parse(json)).toEqual({ value: 'saved' });
	});
});
