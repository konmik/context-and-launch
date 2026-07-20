import { execFile, execFileSync } from 'node:child_process';
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
