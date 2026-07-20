import type { CommandTemplateExecutor } from '../command-template/command-template-types.js';
import { appLog } from './app-logger.js';
import { errorMessage } from '../shared/errors.js';

export async function detectMainBranch(
	projectPath: string, commands: CommandTemplateExecutor,
): Promise<string> {
	for (const branch of ['main', 'master']) {
		const list = await commands.execute('git.main-branch.probe', projectPath, { branch });
		if (list.trim()) return branch;
	}
	throw new Error('Neither main nor master branch exists');
}

export function autoCommit(
	workDir: string, message: string, commands: CommandTemplateExecutor,
): void {
	try {
		commands.executeSync('git.stage-all', workDir);
		if (!commands.executeSync('git.status', workDir).trim()) return;
		commands.executeSync('git.commit', workDir, { message });
	} catch (error) {
		appLog('git', `autoCommit failed (${message}): ${errorMessage(error)}`);
	}
}
