import fs from 'node:fs';
import path from 'node:path';
import type { CommandTemplatePlatform } from './command-template-types.js';

/**
 * Reserved wrapper exit codes. A template's own command can never legitimately
 * report these, so the runner can tell "the command answered N" from "the command
 * never ran". 127 follows the POSIX command-not-found convention; 125 follows
 * git's "the wrapper itself could not run the command" convention. Both sit
 * outside the 64-113 range that sysexits reserves for scripts.
 */
export const COMMAND_NOT_FOUND_EXIT_CODE = 127;
export const INTERPRETER_FAILURE_EXIT_CODE = 125;

export interface ShellInvocation {
	executable: string;
	args: string[];
}

export interface PlatformShellStrategy {
	directExecutableExtensions(): readonly string[];
	isExecutableFile(file: string): boolean;
	buildShellInvocation(script: string): ShellInvocation;
	newlineArgvRejection(program: string): string | undefined;
	detachSpawnedChild(): boolean;
}

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
function invocableScript(script: string): string {
	if (/^\s*["']/.test(script)) return `& ${script}`;
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

// .bat/.cmd need a shell (Node refuses to execFile them), so only these formats
// can run interpreter-free on Windows.
const WINDOWS_DIRECT_EXECUTABLE_EXTENSIONS = ['.exe', '.com'];
const WINDOWS_BATCH_EXTENSIONS = ['.cmd', '.bat'];

function executableFileStats(file: string): fs.Stats | undefined {
	if (!fs.existsSync(file)) return undefined;
	const stats = fs.statSync(file);
	return stats.isFile() ? stats : undefined;
}

function isWindowsExecutableFile(file: string): boolean {
	return executableFileStats(file) !== undefined;
}

function isPathQualified(program: string): boolean {
	return program.includes('/') || program.includes('\\');
}

function executableCandidates(program: string, extensions: readonly string[]): string[] {
	const lowered = program.toLowerCase();
	if (extensions.length === 0) return [program];
	if (extensions.some((extension) => lowered.endsWith(extension))) return [program];
	return extensions.map((extension) => `${program}${extension}`);
}

function searchExecutableOnPath(
	program: string, strategy: PlatformShellStrategy, extensions: readonly string[],
): string | undefined {
	const candidates = executableCandidates(program, extensions);
	for (const directory of (process.env.PATH ?? '').split(path.delimiter)) {
		if (!directory) continue;
		for (const candidate of candidates) {
			const file = path.join(directory, candidate);
			if (strategy.isExecutableFile(file)) return file;
		}
	}
	return undefined;
}

const directExecutableCache = new Map<string, string | undefined>();

export function resolveDirectExecutable(
	program: string, platform: CommandTemplatePlatform,
): string | undefined {
	if (isPathQualified(program)) return undefined;
	const strategy = shellStrategyFor(platform);
	const cacheKey = `${platform}\n${program}\n${process.env.PATH ?? ''}`;
	if (!directExecutableCache.has(cacheKey)) {
		directExecutableCache.set(cacheKey, searchExecutableOnPath(
			program, strategy, strategy.directExecutableExtensions(),
		));
	}
	return directExecutableCache.get(cacheKey);
}

// The shell resolves an extensionless program via PATHEXT, where .com/.exe win
// over .bat/.cmd, so a batch script is the target only when no direct
// executable shadows it.
function isWindowsBatchTarget(program: string): boolean {
	const lowered = program.toLowerCase();
	if (WINDOWS_BATCH_EXTENSIONS.some((extension) => lowered.endsWith(extension))) return true;
	if (WINDOWS_DIRECT_EXECUTABLE_EXTENSIONS.some((extension) => lowered.endsWith(extension))) return false;
	if (isPathQualified(program)) {
		const shadowed = WINDOWS_DIRECT_EXECUTABLE_EXTENSIONS
			.some((extension) => isWindowsExecutableFile(`${program}${extension}`));
		if (shadowed) return false;
		return WINDOWS_BATCH_EXTENSIONS
			.some((extension) => isWindowsExecutableFile(`${program}${extension}`));
	}
	return searchExecutableOnPath(program, windowsShellStrategy, WINDOWS_BATCH_EXTENSIONS) !== undefined;
}

const windowsShellStrategy: PlatformShellStrategy = {
	directExecutableExtensions: () => WINDOWS_DIRECT_EXECUTABLE_EXTENSIONS,
	isExecutableFile: isWindowsExecutableFile,
	buildShellInvocation(script) {
		const wrapper = `${WINDOWS_WRAPPER_PROLOGUE}\n${invocableScript(script)}`;
		return {
			executable: windowsPowerShellExecutable(),
			args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-Command', wrapper],
		};
	},
	newlineArgvRejection(program) {
		if (!isWindowsBatchTarget(program)) return undefined;
		return `${program} resolves to a cmd.exe batch script`
			+ ' and cannot receive arguments containing newlines';
	},
	detachSpawnedChild: () => false,
};

const posixShellStrategy: PlatformShellStrategy = {
	directExecutableExtensions: () => [],
	isExecutableFile(file) {
		const stats = executableFileStats(file);
		return stats !== undefined && (stats.mode & 0o111) !== 0;
	},
	// Bash already exits 127 for an unresolvable command and propagates a failing
	// command's own code under errexit, so only pipefail needs adding.
	buildShellInvocation(script) {
		const wrapper = `set -e\nset -o pipefail\n${script}`;
		return { executable: '/bin/bash', args: ['-c', wrapper] };
	},
	newlineArgvRejection: () => undefined,
	detachSpawnedChild: () => true,
};

export function shellStrategyFor(platform: CommandTemplatePlatform): PlatformShellStrategy {
	return platform === 'windows' ? windowsShellStrategy : posixShellStrategy;
}
