import { readFileSync } from 'node:fs';
import { platformCommandTemplateKey } from '../command-template/command-template-definitions.js';
import { currentCommandTemplatePlatform } from '../command-template/command-template-types.js';
import type { CommandTemplateExecutor } from '../command-template/command-template-types.js';
import { AppError, ProcessError } from '../shared/errors.js';
import { normalizeMacPickedPath } from './picker-paths.js';

/**
 * Every picker template reports a user cancellation the same way its underlying
 * tool does: zenity, kdialog and osascript all exit 1. `exitedWith` is what makes
 * that readable as an answer rather than as a broken invocation.
 */
function isCancellation(error: unknown): boolean {
	return error instanceof ProcessError && error.exitedWith(1);
}

/**
 * A template that found no usable picker exits with USER_ERROR_EXIT_CODE and its
 * own message, which surfaces as AppError. A missing interpreter or tool surfaces
 * as command-not-found. Both mean "no picker here", neither is an app failure.
 */
function unavailableReason(error: unknown): string | undefined {
	if (error instanceof AppError) return error.message;
	if (error instanceof ProcessError && error.kind === 'command-not-found') return unavailableMessage();
	return undefined;
}

function readStub(inlineVariable: string, fileVariable: string): string | undefined {
	const stubFile = process.env[fileVariable];
	return stubFile ? readFileSync(stubFile, 'utf8').trim() : process.env[inlineVariable];
}

function runPicker(
	commands: CommandTemplateExecutor, family: 'picker.files' | 'picker.directory', startDir: string,
): Promise<string> {
	const directory = startDir || process.cwd();
	const key = platformCommandTemplateKey(family, currentCommandTemplatePlatform());
	return commands.execute(key, directory, { startDir: directory });
}

export async function openFileDialog(
	startDir: string | undefined, commands: CommandTemplateExecutor,
): Promise<string[]> {
	const stub = readStub('CONTEXT_FILE_PICKER_STUB', 'CONTEXT_FILE_PICKER_STUB_FILE');
	if (stub === '__cancel__') return [];
	if (stub === '__error__') throw new Error('Stubbed file picker error');
	if (stub) return stub.split('\n').filter(Boolean);
	try {
		const stdout = await runPicker(commands, 'picker.files', startDir ?? '');
		return stdout.trim().split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
	} catch (error) {
		if (isCancellation(error)) return [];
		throw error;
	}
}

export type DirectoryPickerResult =
	| { path: string }
	| { cancelled: true }
	| { error: string };

export async function openDirectoryDialog(
	preselect: string, commands: CommandTemplateExecutor,
): Promise<DirectoryPickerResult> {
	const stub = readStub('CONTEXT_PICKER_STUB', 'CONTEXT_PICKER_STUB_FILE');
	if (stub === '__cancel__') return { cancelled: true };
	if (stub === '__unavailable__') return { error: unavailableMessage() };
	if (stub === '__error__') return { error: 'Stubbed picker error' };
	if (stub) return { path: stub };

	try {
		const stdout = await runPicker(commands, 'picker.directory', preselect);
		const picked = currentCommandTemplatePlatform() === 'macos'
			? normalizeMacPickedPath(stdout)
			: stdout.trim();
		return picked ? { path: picked } : { cancelled: true };
	} catch (error) {
		if (isCancellation(error)) return { cancelled: true };
		const unavailable = unavailableReason(error);
		if (unavailable) return { error: unavailable };
		return { error: error instanceof Error ? error.message : String(error) };
	}
}

function unavailableMessage(): string {
	return `No directory picker is available on ${process.platform}. `
		+ 'Install zenity or kdialog (Linux), or paste the path manually.';
}
