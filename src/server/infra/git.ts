import { execFile, execFileSync } from 'child_process';
import { ProcessError } from '../shared/errors.js';

const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' };

export function git(workDir: string, ...args: string[]): Promise<string> {
	const command = `git ${args.join(' ')}`;
	console.log(`[git] ${command}  (cwd: ${workDir})`);
	return new Promise((resolve, reject) => {
		const options = { cwd: workDir, timeout: 30000, encoding: 'utf-8' as const, env: gitEnv };
		execFile('git', args, options, (error, stdout, stderr) => {
			if (error) {
				const output = (stderr || stdout || '').trim() || error.message;
				console.log(`[git] FAIL ${command}  =>  ${output}`);
				reject(new ProcessError(command, typeof error.code === 'number' ? error.code : undefined, output));
				return;
			}
			resolve(stdout);
		});
	});
}

export function gitSync(workDir: string, ...args: string[]): string {
	const command = `git ${args.join(' ')}`;
	console.log(`[git] ${command}  (cwd: ${workDir})`);
	return execFileSync('git', args, { cwd: workDir, timeout: 30000, encoding: 'utf-8', env: gitEnv });
}

export async function detectMainBranch(projectPath: string): Promise<string> {
	for (const name of ['main', 'master']) {
		const list = await git(projectPath, 'branch', '--list', name);
		if (list.trim()) return name;
	}
	throw new Error('Neither main nor master branch exists');
}

export function autoCommit(workDir: string, message: string): void {
	try {
		gitSync(workDir, 'add', '-A');
		const status = gitSync(workDir, 'status', '--porcelain');
		if (!status.trim()) return;
		gitSync(workDir, 'commit', '-m', message);
	} catch (err) {
		console.warn(`autoCommit failed (${message}):`, err);
	}
}
