import { AppError } from '../shared/errors.js';

export type HerdrUnavailableReason = 'cli-missing' | 'server-not-running';

const MESSAGE_BY_REASON: Record<HerdrUnavailableReason, string> = {
	'cli-missing': 'Herdr is not installed or is not available on PATH.',
	'server-not-running': 'Herdr is not running.',
};

/**
 * Herdr produced no answer because Herdr itself is not there. Every Herdr
 * command is a call over the Herdr server socket, so a stopped server fails the
 * same way for every command and says nothing about the command that was asked.
 * Callers whose only question is which agents exist may read this as "none".
 */
export class HerdrUnavailableError extends AppError {
	constructor(readonly reason: HerdrUnavailableReason) {
		super(MESSAGE_BY_REASON[reason]);
	}
}
