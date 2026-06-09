export interface ErrorInfo {
	description: string;
	command?: string;
	output?: string;
}

export class AppError extends Error {
	constructor(
		message: string,
		public readonly statusCode: number = 500,
	) {
		super(message);
	}
}

export class ValidationError extends AppError {
	constructor(message: string) { super(message, 400); }
}

export class NotFoundError extends AppError {
	constructor(message: string) { super(message, 404); }
}

export class PayloadError extends AppError {
	constructor(
		message: string,
		statusCode: number,
		public readonly payload: Record<string, unknown>,
	) {
		super(message, statusCode);
	}
}

export class ProcessError extends Error {
	readonly shortDescription: string;

	constructor(
		public readonly command: string,
		public readonly exitCode: number | undefined,
		public readonly output: string,
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

export function errorPayload(e: unknown): ErrorInfo {
	if (e instanceof ProcessError) {
		return {
			description: e.shortDescription,
			command: e.command,
			output: e.output,
		};
	}
	return { description: errorMessage(e) };
}
