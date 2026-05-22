import { describe, it, expect } from 'vitest';
import { errorMessage } from './errors.js';

describe('errorMessage', () => {
	it('returns the message from an Error instance', () => {
		expect(errorMessage(new Error('boom'))).toBe('boom');
	});

	it('with a thrown string returns the string, not "Unknown error"', () => {
		expect(errorMessage('something went wrong')).toBe('something went wrong');
	});

	it('with a thrown plain object returns the message property, not "Unknown error"', () => {
		expect(errorMessage({ message: 'object error' })).toBe('object error');
	});

	it('with a thrown number returns "Unknown error"', () => {
		expect(errorMessage(42)).toBe('Unknown error');
	});
});
