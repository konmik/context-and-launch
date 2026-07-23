import path from 'node:path';
import { platformCommandTemplateKey } from '../command-template/command-template-definitions.js';
import { currentCommandTemplatePlatform } from '../command-template/command-template-types.js';
import type { CommandTemplateExecutor } from '../command-template/command-template-types.js';

export async function openInOs(
	directory: string, commands: CommandTemplateExecutor,
): Promise<void> {
	if (process.env.CONTEXT_OPEN_IN_OS_STUB === '__noop__') return;
	const nativePath = path.normalize(directory);
	const key = platformCommandTemplateKey('open.directory', currentCommandTemplatePlatform());
	await commands.execute(key, nativePath, { directory: nativePath });
}
