import { appLog, type AppLogContext } from '../infra/app-logger.js';
import { ProcessError, type ProcessFailureKind } from '../shared/errors.js';
import { buildDirectInvocationArgv } from './command-template-direct-invocation.js';
import type { CommandTemplateKey } from './command-template-definitions.js';
import { interpolateCommandTemplate } from './command-template-interpolation.js';
import type { CommandTemplateStore } from './command-template-store.js';
import {
	currentCommandTemplatePlatform,
	type CommandTemplateExecutor,
	type CommandTemplateMode,
	type CommandTemplatePlatform,
	type CommandTemplateValues,
	type PlatformShellRunner,
	type ShellExecutionRequest,
} from './command-template-types.js';

export type CommandTemplateLog = (
	category: string, message: string, context?: AppLogContext,
) => void;

/**
 * A trusted script is a user-authored Profile or Shortcut body, so its log
 * identity is a pair, not two optional fields that any caller could mix. Making
 * it a union means the runner identity and the selected name cannot disagree.
 */
export type TrustedScriptSource =
	| { kind: 'profile'; profileName: string }
	| { kind: 'shortcut'; shortcutName: string };

const TRUSTED_SCRIPT_IDENTITY = {
	profile: 'agent-launch.profile',
	shortcut: 'agent-launch.shortcut',
} as const;

export interface TrustedScriptOptions {
	source: TrustedScriptSource;
	script: string;
	values: CommandTemplateValues;
	knownScalarPlaceholders: readonly string[];
	knownListPlaceholders?: readonly string[];
	cwd: string;
	mode?: CommandTemplateMode;
	timeoutMs?: number;
}

const FAILURE_LOG_MESSAGES: Record<ProcessFailureKind, string> = {
	exited: 'non-zero failure',
	'command-not-found': 'command not found',
	'interpreter-failure': 'interpreter failure',
	timeout: 'timeout',
	'spawn-error': 'spawn error',
};

function failureLogMessage(error: unknown): string {
	return error instanceof ProcessError ? FAILURE_LOG_MESSAGES[error.kind] : 'spawn error';
}

function trustedScriptContext(source: TrustedScriptSource): AppLogContext {
	return source.kind === 'profile'
		? { commandTemplateKey: TRUSTED_SCRIPT_IDENTITY.profile, profileName: source.profileName }
		: { commandTemplateKey: TRUSTED_SCRIPT_IDENTITY.shortcut, shortcutName: source.shortcutName };
}

export class CommandTemplateService implements CommandTemplateExecutor {
	constructor(
		private readonly store: CommandTemplateStore,
		private readonly runner: PlatformShellRunner,
		private readonly platform: CommandTemplatePlatform = currentCommandTemplatePlatform(),
		private readonly log: CommandTemplateLog = appLog,
	) {}

	entriesForCurrentPlatform() {
		return this.store.load().filter((entry) => entry.platforms.includes(this.platform));
	}

	get(key: CommandTemplateKey) {
		const entry = this.store.get(key);
		if (!entry.platforms.includes(this.platform)) {
			throw new Error(`Command Template '${key}' is not available on ${this.platform}.`);
		}
		return entry;
	}

	save(key: CommandTemplateKey, script: string) {
		return this.store.save(key, script);
	}

	reset(key: CommandTemplateKey) {
		return this.store.reset(key);
	}

	render(key: CommandTemplateKey, values: CommandTemplateValues = {}): string {
		const entry = this.get(key);
		return interpolateCommandTemplate(
			entry.script, values, entry.scalarPlaceholders, entry.listPlaceholders, this.platform,
		);
	}

	async execute(
		key: CommandTemplateKey, cwd: string, values: CommandTemplateValues = {},
	): Promise<string> {
		return this.executeRequest(this.buildExecutionRequest(key, cwd, values));
	}

	executeSync(key: CommandTemplateKey, cwd: string, values: CommandTemplateValues = {}): string {
		const request = this.buildExecutionRequest(key, cwd, values);
		this.log('command-template', 'start', { commandTemplateKey: key });
		try {
			const stdout = this.runner.executeSync(request);
			this.log('command-template', 'success', { commandTemplateKey: key });
			return stdout;
		} catch (error) {
			this.logFailure(key, error);
			throw error;
		}
	}

	async executeTrustedScript(options: TrustedScriptOptions): Promise<string> {
		const context = trustedScriptContext(options.source);
		const renderedScript = interpolateCommandTemplate(
			options.script,
			options.values,
			options.knownScalarPlaceholders,
			options.knownListPlaceholders ?? [],
			this.platform,
		);
		const request: ShellExecutionRequest = {
			key: TRUSTED_SCRIPT_IDENTITY[options.source.kind],
			platform: this.platform,
			script: renderedScript,
			cwd: options.cwd,
			environment: {},
			mode: options.mode ?? 'detached',
			timeoutMs: options.timeoutMs ?? 10_000,
		};
		return this.executeRequest(request, context);
	}

	private buildExecutionRequest(
		key: CommandTemplateKey, cwd: string, values: CommandTemplateValues,
	): ShellExecutionRequest {
		const entry = this.get(key);
		return {
			key,
			platform: this.platform,
			script: interpolateCommandTemplate(
				entry.script,
				values,
				entry.scalarPlaceholders,
				entry.listPlaceholders,
				this.platform,
			),
			argv: buildDirectInvocationArgv(
				entry.script,
				values,
				entry.scalarPlaceholders,
				entry.listPlaceholders,
			),
			cwd,
			environment: entry.environment,
			mode: entry.mode,
			timeoutMs: entry.timeoutMs,
			detachDelayMs: entry.detachDelayMs,
		};
	}

	private async executeRequest(
		request: ShellExecutionRequest,
		context: AppLogContext = { commandTemplateKey: request.key },
	): Promise<string> {
		this.log('command-template', 'start', context);
		try {
			const stdout = await this.runner.execute(request);
			this.log('command-template', 'success', context);
			return stdout;
		} catch (error) {
			this.logFailure(request.key, error, context);
			throw error;
		}
	}

	private logFailure(key: string, error: unknown, extra: AppLogContext = {}): void {
		this.log('command-template', failureLogMessage(error), { ...extra, commandTemplateKey: key });
	}
}
