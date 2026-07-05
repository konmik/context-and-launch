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

export class ProcessError extends Error {
	readonly shortDescription: string;

	constructor(
		public readonly command: string,
		public readonly exitCode: number | undefined,
		public readonly output: string | undefined,
		description?: string,
	) {
		const desc = description ?? `${command} failed${exitCode != null ? ` (exit ${exitCode})` : ''}`;
		super(output ? `${desc}: ${output}` : desc);
		this.shortDescription = desc;
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
