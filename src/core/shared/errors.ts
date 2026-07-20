export interface ErrorInfo {
	title?: string;
	description: string;
	command?: string;
	output?: string;
}

export class AppError extends Error {
	constructor(message: string) {
		super(message);
	}
}

export class ValidationError extends AppError {
	constructor(message: string) { super(message); }
}

export class NotFoundError extends AppError {
	constructor(message: string) { super(message); }
}

/**
 * Why a command failed, as classified at the shell boundary.
 *
 * `exited` is the only kind whose `exitCode` was chosen by the command itself,
 * so it is the only kind a caller may interpret as a probe answer. Every other
 * kind means the command never produced a verdict. Without this distinction a
 * caller cannot tell "git says these commits are unrelated" from "git is not
 * installed", because both surface as a non-zero exit.
 */
export type ProcessFailureKind =
	| 'exited'
	| 'command-not-found'
	| 'interpreter-failure'
	| 'timeout'
	| 'spawn-error';

export class ProcessError extends Error {
	readonly shortDescription: string;

	constructor(
		public readonly command: string,
		public readonly exitCode: number | undefined,
		public readonly output: string | undefined,
		description?: string,
		public readonly kind: ProcessFailureKind = 'exited',
	) {
		const desc = description ?? `${command} failed${exitCode != null ? ` (exit ${exitCode})` : ''}`;
		super(output ? `${desc}: ${output}` : desc);
		this.shortDescription = desc;
	}

	/** True when the command ran to completion and chose `code` itself. */
	exitedWith(code: number): boolean {
		return this.kind === 'exited' && this.exitCode === code;
	}
}

export function errorMessage(e: unknown): string {
	if (e instanceof Error) return e.message;
	if (typeof e === 'string') return e;
	if (typeof e === 'object' && e !== null && 'message' in e
		&& typeof (e as { message: unknown }).message === 'string') {
		return (e as { message: string }).message;
	}
	return 'Unknown error';
}

export function errorResult(e: unknown) {
	return { ok: false as const, type: "error" as const, message: errorMessage(e), errorInfo: errorPayload(e) };
}

export function errorPayload(e: unknown, title?: string): ErrorInfo {
	if (e instanceof ProcessError) {
		return {
			title,
			description: e.shortDescription,
			command: e.command,
			output: e.output,
		};
	}
	return { title, description: errorMessage(e) };
}
