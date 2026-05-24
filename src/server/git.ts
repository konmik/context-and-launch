import { exec, execSync } from 'child_process';

function escapeArgs(args: string[]): string {
	return args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(' ');
}

export function git(workDir: string, ...args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		exec(`git ${escapeArgs(args)}`, { cwd: workDir, timeout: 30000 }, (error, stdout, stderr) => {
			if (error) {
				const output = (stderr || stdout || '').trim();
				reject(new Error(`git ${args.join(' ')} failed (exit ${error.code}): ${output}`));
				return;
			}
			resolve(stdout);
		});
	});
}

export function gitSync(workDir: string, ...args: string[]): string {
	return execSync(`git ${escapeArgs(args)}`, { cwd: workDir, timeout: 30000, encoding: 'utf-8' });
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
