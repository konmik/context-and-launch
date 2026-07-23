import { execFile, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ProcessError } from './core/shared/errors.js';

const environment = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' };

/** Test-fixture helper; shipped features use semantic Command Templates. */
export function git(workDir: string, ...args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile('git', args, { cwd: workDir, timeout: 30_000, encoding: 'utf8', env: environment },
			(error, stdout, stderr) => {
				if (error) {
					reject(new ProcessError(
						`git ${args.join(' ')}`,
						typeof error.code === 'number' ? error.code : undefined,
						(stderr || stdout || error.message).trim(),
					));
					return;
				}
				resolve(stdout);
			},
		);
	});
}

export function gitSync(workDir: string, ...args: string[]): string {
	return execFileSync('git', args, {
		cwd: workDir, timeout: 30_000, encoding: 'utf8', env: environment,
	});
}

export function gitFastImport(workDir: string, input: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn('git', ['fast-import', '--quiet'], {
			cwd: workDir,
			env: environment,
			stdio: ['pipe', 'ignore', 'pipe'],
		});
		let stderr = '';
		child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
		child.once('error', reject);
		child.once('exit', (code) => {
			if (code === 0) resolve();
			else reject(new Error(`git fast-import failed (${code}): ${stderr.trim()}`));
		});
		child.stdin.end(input);
	});
}

export function setGitOriginUrl(repoDir: string, url: string): void {
	const configPath = path.join(repoDir, '.git', 'config');
	const escaped = url.replace(/\\/g, '\\\\');
	const config = fs
		.readFileSync(configPath, 'utf8')
		.replace(/(\[remote "origin"\][\s\S]*?url = ).*/, `$1${escaped}`);
	fs.writeFileSync(configPath, config);
}
