import { execFile, execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AppError, ProcessError, type ProcessFailureKind } from '../shared/errors.js';
import {
	COMMAND_NOT_FOUND_EXIT_CODE, INTERPRETER_FAILURE_EXIT_CODE,
	resolveDirectExecutable, shellStrategyFor, windowsPowerShellExecutable,
	type ShellInvocation,
} from './platform-shell-strategy.js';
import type {
	PlatformShellRunner, ShellExecutionRequest,
} from './command-template-types.js';

export { COMMAND_NOT_FOUND_EXIT_CODE, INTERPRETER_FAILURE_EXIT_CODE, windowsPowerShellExecutable };

export const USER_ERROR_EXIT_CODE = 64;

function classifyExitCode(exitCode: number | undefined): ProcessFailureKind {
	if (exitCode === COMMAND_NOT_FOUND_EXIT_CODE) return 'command-not-found';
	if (exitCode === INTERPRETER_FAILURE_EXIT_CODE) return 'interpreter-failure';
	return 'exited';
}

function buildInvocation(request: ShellExecutionRequest): ShellInvocation {
	const strategy = shellStrategyFor(request.platform);
	if (request.argv && request.argv.length > 0) {
		const executable = resolveDirectExecutable(request.argv[0], request.platform);
		if (executable) return { executable, args: request.argv.slice(1) };
		if (request.argv.some((value) => /[\r\n]/.test(value))) {
			const rejection = strategy.newlineArgvRejection(request.argv[0]);
			if (rejection) {
				throw createProcessError(request, undefined, '', '', rejection, 'spawn-error');
			}
		}
	}
	return strategy.buildShellInvocation(request.script);
}

function displayCommand(request: ShellExecutionRequest): string {
	return `Command Template ${request.key}`;
}

function executionEnvironment(request: ShellExecutionRequest): NodeJS.ProcessEnv {
	return { ...process.env, ...request.environment };
}

function createProcessError(
	request: ShellExecutionRequest,
	exitCode: number | undefined,
	stdout: string,
	stderr: string,
	description?: string,
	kind: ProcessFailureKind = classifyExitCode(exitCode),
): Error {
	const output = `${stdout}${stderr}`.trim() || undefined;
	if (exitCode === USER_ERROR_EXIT_CODE && stderr.trim()) return new AppError(stderr.trim());
	return new ProcessError(displayCommand(request), exitCode, output, description, kind);
}

/**
 * A failure to start the interpreter, or the resolved executable disappearing
 * between the PATH probe and the spawn, arrives as an errno rather than an exit
 * code. Map it onto the same vocabulary the wrapper produces.
 */
function spawnFailureKind(error: { code?: string | number | null }): ProcessFailureKind {
	return error.code === 'ENOENT' ? 'command-not-found' : 'spawn-error';
}

export class FixedPlatformShellRunner implements PlatformShellRunner {
	execute(request: ShellExecutionRequest): Promise<string> {
		if (request.mode === 'detached') {
			return this.executeDetached(request);
		}
		const invocation = buildInvocation(request);
		return new Promise((resolve, reject) => {
			execFile(invocation.executable, invocation.args, {
				cwd: request.cwd,
				env: executionEnvironment(request),
				timeout: request.timeoutMs,
				encoding: 'utf8',
				maxBuffer: 16 * 1024 * 1024,
			}, (error, stdout, stderr) => {
				if (error) {
					const code = typeof error.code === 'number' ? error.code : undefined;
					const description = error.killed
						? `Timed out after ${request.timeoutMs}ms`
						: error.message;
					const kind: ProcessFailureKind = error.killed
						? 'timeout'
						: code === undefined ? spawnFailureKind(error) : classifyExitCode(code);
					reject(createProcessError(request, code, stdout, stderr, description, kind));
					return;
				}
				resolve(stdout);
			});
		});
	}

	executeSync(request: ShellExecutionRequest): string {
		const invocation = buildInvocation(request);
		try {
			const stdout = execFileSync(invocation.executable, invocation.args, {
				cwd: request.cwd,
				env: executionEnvironment(request),
				timeout: request.timeoutMs,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe'],
				maxBuffer: 16 * 1024 * 1024,
			});
			return stdout;
		} catch (error) {
			const failure = error as NodeJS.ErrnoException & {
				status?: number; stdout?: Buffer | string; stderr?: Buffer | string; killed?: boolean;
			};
			const stdout = failure.stdout?.toString() ?? '';
			const stderr = failure.stderr?.toString() ?? '';
			const status = typeof failure.status === 'number' ? failure.status : undefined;
			throw createProcessError(
				request,
				status,
				stdout,
				stderr,
				failure.killed ? `Timed out after ${request.timeoutMs}ms` : failure.message,
				failure.killed
					? 'timeout'
					: status === undefined ? spawnFailureKind(failure) : classifyExitCode(status),
			);
		}
	}

	private executeDetached(request: ShellExecutionRequest): Promise<string> {
		const invocation = buildInvocation(request);
		const stderrFile = path.join(os.tmpdir(), `context-launch-stderr-${crypto.randomUUID()}.log`);
		const descriptor = fs.openSync(stderrFile, 'w');
		const child = spawn(invocation.executable, invocation.args, {
			cwd: request.cwd,
			env: executionEnvironment(request),
			detached: shellStrategyFor(request.platform).detachSpawnedChild(),
			windowsHide: true,
			stdio: ['ignore', 'ignore', descriptor],
		});
		fs.closeSync(descriptor);

		const takeStderr = (): string => {
			const value = fs.existsSync(stderrFile) ? fs.readFileSync(stderrFile, 'utf8') : '';
			fs.rmSync(stderrFile, { force: true });
			return value;
		};

		return new Promise((resolve, reject) => {
			let settled = false;
			child.once('error', (error: NodeJS.ErrnoException) => {
				takeStderr();
				if (settled) return;
				settled = true;
				reject(createProcessError(
					request, undefined, '', '', error.message, spawnFailureKind(error),
				));
			});
			child.once('exit', (code) => {
				const stderr = takeStderr();
				if (settled) return;
				settled = true;
				if (code !== 0) {
					reject(createProcessError(
						request, code ?? undefined, '', stderr,
						code === null ? 'Process terminated abnormally' : `Failed (exit ${code})`,
						code === null ? 'spawn-error' : classifyExitCode(code),
					));
					return;
				}
				resolve('');
			});
			child.once('spawn', () => {
				child.unref();
				setTimeout(() => {
					if (settled) return;
					settled = true;
					takeStderr();
					resolve('');
				}, request.detachDelayMs ?? request.timeoutMs);
			});
		});
	}
}
