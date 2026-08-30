import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as v from 'valibot';

export function makeTempDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const transientCodes = new Set(['EBUSY', 'ENOTEMPTY', 'EPERM']);

export async function removeTempDir(dir: string): Promise<void> {
	const deadline = Date.now() + 5000;
	for (;;) {
		try {
			fs.rmSync(dir, { recursive: true, force: true });
			return;
		} catch (e) {
			const parsedCode = e instanceof Error && 'code' in e
				? v.safeParse(v.string(), e.code)
				: undefined;
			const code = parsedCode?.success ? parsedCode.output : undefined;
			if (!code || !transientCodes.has(code) || Date.now() > deadline) throw e;
			await new Promise((r) => setTimeout(r, 100));
		}
	}
}

export async function removeTempDirOrWarn(dir: string): Promise<void> {
	try {
		await removeTempDir(dir);
	} catch (err) {
		console.warn(`temp cleanup failed for ${dir}: ${err instanceof Error ? err.message : String(err)}`);
	}
}

export function keyedTemplate<T>(build: (key: string) => T): (key: string) => T {
	const cache = new Map<string, T>();
	return (key) => {
		if (!cache.has(key)) cache.set(key, build(key));
		return cache.get(key)!;
	};
}

export function lazyTemplate<T>(build: () => T): () => T {
	const get = keyedTemplate(build);
	return () => get('');
}

export function cloneFromTemplate(templateDir: string, prefix: string): string {
	const dir = makeTempDir(prefix);
	fs.cpSync(templateDir, dir, { recursive: true });
	return dir;
}
