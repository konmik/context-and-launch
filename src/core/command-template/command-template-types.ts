import type { CommandTemplateKey } from './command-template-definitions.js';

export type { CommandTemplateKey };

export type CommandTemplatePlatform = 'windows' | 'macos' | 'linux';

export type CommandTemplateMode = 'capture' | 'detached';

export const COMMAND_TEMPLATE_GROUP_ORDER = [
	'Git and repository checks',
	'Ticket Sync',
	'Conflict Resolution',
	'Worktree management',
	'Agent Worktree lifecycle',
	'Herdr integration',
	'Agent launching and process inspection',
	'File and directory pickers',
	'Operating-system open actions',
] as const;

export type CommandTemplateFeatureGroup = typeof COMMAND_TEMPLATE_GROUP_ORDER[number];

export type CommandTemplateValue = string | readonly string[];
export type CommandTemplateValues = Readonly<Record<string, CommandTemplateValue>>;

export interface CommandTemplateDefinition {
	readonly key: string;
	readonly label: string;
	readonly featureGroup: CommandTemplateFeatureGroup;
	readonly platforms: readonly CommandTemplatePlatform[];
	readonly scalarPlaceholders: readonly string[];
	readonly listPlaceholders: readonly string[];
	readonly environment: Readonly<Record<string, string>>;
	readonly mode: CommandTemplateMode;
	readonly timeoutMs: number;
	readonly detachDelayMs?: number;
}

export interface CommandTemplateEntry extends CommandTemplateDefinition {
	readonly key: CommandTemplateKey;
	readonly script: string;
	readonly isOverridden: boolean;
}

export interface ShellExecutionRequest {
	readonly key: string;
	readonly platform: CommandTemplatePlatform;
	readonly script: string;
	/**
	 * Present when the template is a single shell-free command line: the raw
	 * argument vector to run directly, skipping the platform interpreter. The
	 * runner still falls back to `script` when argv[0] is not a real executable
	 * on PATH (e.g. a PowerShell cmdlet or shell builtin).
	 */
	readonly argv?: readonly string[];
	readonly cwd: string;
	readonly environment: Readonly<Record<string, string>>;
	readonly mode: CommandTemplateMode;
	readonly timeoutMs: number;
	readonly detachDelayMs?: number;
}

export interface PlatformShellRunner {
	execute(request: ShellExecutionRequest): Promise<string>;
	executeSync(request: ShellExecutionRequest): string;
}

/**
 * `cwd` is an execution parameter, not a template value: no script interpolates
 * it, and every action needs exactly one. Passing it explicitly keeps it out of
 * the untyped values bag, which is what previously forced a runtime type check
 * for a field the type system should have guaranteed.
 */
export interface CommandTemplateExecutor {
	execute(key: CommandTemplateKey, cwd: string, values?: CommandTemplateValues): Promise<string>;
	executeSync(key: CommandTemplateKey, cwd: string, values?: CommandTemplateValues): string;
	render(key: CommandTemplateKey, values?: CommandTemplateValues): string;
}

export function currentCommandTemplatePlatform(
	platform: NodeJS.Platform = process.platform,
): CommandTemplatePlatform {
	if (platform === 'win32') return 'windows';
	if (platform === 'darwin') return 'macos';
	return 'linux';
}
