import { execFile, execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AppError, ProcessError, type ProcessFailureKind } from '../shared/errors.js';
import type {
	PlatformShellRunner, ShellExecutionRequest,
} from './command-template-types.js';

export const USER_ERROR_EXIT_CODE = 64;

/**
 * Reserved wrapper exit codes. A template's own command can never legitimately
 * report these, so the runner can tell "the command answered N" from "the command
 * never ran". 127 follows the POSIX command-not-found convention; 125 follows
 * git's "the wrapper itself could not run the command" convention. Both sit
 * outside the 64-113 range that sysexits reserves for scripts.
 */
export const COMMAND_NOT_FOUND_EXIT_CODE = 127;
export const INTERPRETER_FAILURE_EXIT_CODE = 125;

// `pwsh -Command` collapses any non-zero native exit to 1, and a statement
// terminating engine error (CommandNotFoundException) is indistinguishable from
// a command that deliberately exited 1. The trap re-widens both: it re-raises the
// native command's real code, and maps engine failures onto the reserved codes.
const WINDOWS_WRAPPER_PROLOGUE = [
	"$ErrorActionPreference = 'Stop'",
	'trap {',
	'  $e = $_.Exception',
	'  if ($e -is [System.Management.Automation.CommandNotFoundException]) {',
	'    [Console]::Error.WriteLine($_.ToString())',
	`    exit ${COMMAND_NOT_FOUND_EXIT_CODE}`,
	'  }',
	'  if ($null -ne $e.ExitCode) { exit $e.ExitCode }',
	'  [Console]::Error.WriteLine($_.ToString())',
	`  exit ${INTERPRETER_FAILURE_EXIT_CODE}`,
	'}',
	'if ($PSVersionTable.PSVersion.Major -lt 7) {',
	"  [Console]::Error.WriteLine('PowerShell 7 is required')",
	`  exit ${INTERPRETER_FAILURE_EXIT_CODE}`,
	'}',
	'$PSNativeCommandUseErrorActionPreference = $true',
].join('\n');

/**
 * PowerShell parses a quoted leading token as a string expression, so the rest of
 * the line becomes a parse error -- and parse errors happen before `trap` is
 * installed, surfacing as a bare exit 1 that cannot be classified. The call
 * operator makes it an invocation instead. This applies to any script whose
 * program is quoted, whether that came from a placeholder in a catalog template
 * or from a user's Profile body.
 */
function invocableScript(script: string, platform: ShellExecutionRequest['platform']): string {
	if (platform === 'windows' && /^\s*["']/.test(script)) return `& ${script}`;
	return script;
}

/**
 * A GUI-launched process inherits the PATH snapshot of the explorer session that
 * started it, which can predate a PowerShell 7 install even though a fresh
 * terminal resolves `pwsh` fine. Probe PATH first, then fall back to the known
 * install locations so a stale PATH no longer breaks every PowerShell template.
 * Returns the bare name as a last resort, preserving the command-not-found error
 * when pwsh is genuinely absent.
 */
function knownWindowsPowerShellLocations(): string[] {
	const locations: string[] = [];
	for (const root of [process.env.ProgramW6432, process.env.ProgramFiles, process.env['ProgramFiles(x86)']]) {
		if (root) locations.push(path.join(root, 'PowerShell', '7', 'pwsh.exe'));
	}
	if (process.env.LOCALAPPDATA) {
		locations.push(path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'pwsh.exe'));
	}
	return locations;
}

export function windowsPowerShellExecutable(): string {
	const onPath = resolveDirectExecutable('pwsh', 'windows');
	if (onPath) return onPath;
	for (const file of knownWindowsPowerShellLocations()) {
		if (fs.existsSync(file)) return file;
	}
	return 'pwsh';
}

function buildShellInvocation(request: ShellExecutionRequest): { executable: string; args: string[] } {
	if (request.platform === 'windows') {
		const wrapper = `${WINDOWS_WRAPPER_PROLOGUE}\n${invocableScript(request.script, 'windows')}`;
		return {
			executable: windowsPowerShellExecutable(),
			args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-Command', wrapper],
		};
	}
	// Bash already exits 127 for an unresolvable command and propagates a failing
	// command's own code under errexit, so only pipefail needs adding.
	const wrapper = `set -e\nset -o pipefail\n${request.script}`;
	return { executable: '/bin/bash', args: ['-c', wrapper] };
}

function classifyExitCode(exitCode: number | undefined): ProcessFailureKind {
	if (exitCode === COMMAND_NOT_FOUND_EXIT_CODE) return 'command-not-found';
	if (exitCode === INTERPRETER_FAILURE_EXIT_CODE) return 'interpreter-failure';
	return 'exited';
}

// .bat/.cmd need a shell (Node refuses to execFile them), so only these formats
// can run interpreter-free on Windows.
const WINDOWS_DIRECT_EXECUTABLE_EXTENSIONS = ['.exe', '.com'];
const directExecutableCache = new Map<string, string | undefined>();

function isExecutableFile(file: string, platform: ShellExecutionRequest['platform']): boolean {
	if (!fs.existsSync(file)) return false;
	const stats = fs.statSync(file);
	if (!stats.isFile()) return false;
	return platform === 'windows' || (stats.mode & 0o111) !== 0;
}

function searchExecutableOnPath(
	program: string, platform: ShellExecutionRequest['platform'],
): string | undefined {
	const lowered = program.toLowerCase();
	const candidates = platform === 'windows'
		? WINDOWS_DIRECT_EXECUTABLE_EXTENSIONS.some((extension) => lowered.endsWith(extension))
			? [program]
			: WINDOWS_DIRECT_EXECUTABLE_EXTENSIONS.map((extension) => `${program}${extension}`)
		: [program];
	for (const directory of (process.env.PATH ?? '').split(path.delimiter)) {
		if (!directory) continue;
		for (const candidate of candidates) {
			const file = path.join(directory, candidate);
			if (isExecutableFile(file, platform)) return file;
		}
	}
	return undefined;
}

function resolveDirectExecutable(
	program: string, platform: ShellExecutionRequest['platform'],
): string | undefined {
	if (program.includes('/') || program.includes('\\')) return undefined;
	const cacheKey = `${platform}\n${program}\n${process.env.PATH ?? ''}`;
	if (!directExecutableCache.has(cacheKey)) {
		directExecutableCache.set(cacheKey, searchExecutableOnPath(program, platform));
	}
	return directExecutableCache.get(cacheKey);
}

function buildInvocation(request: ShellExecutionRequest): { executable: string; args: string[] } {
	if (request.argv && request.argv.length > 0) {
		const executable = resolveDirectExecutable(request.argv[0], request.platform);
		if (executable) return { executable, args: request.argv.slice(1) };
	}
	return buildShellInvocation(request);
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
			detached: request.platform !== 'windows',
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
