import { describe, it, expect } from 'vitest';
import { resolveStatusSwatch } from './status-swatch.js';

describe('resolveStatusSwatch', () => {
	it('returns column-color for a status matching a colored column', () => {
		const result = resolveStatusSwatch('todo', [{ name: 'todo', color: '#1a7f37' }]);
		expect(result).toEqual({ kind: 'column-color', hex: '#1a7f37' });
	});

	it('returns none for a status matching an uncolored column', () => {
		const result = resolveStatusSwatch('todo', [{ name: 'todo' }]);
		expect(result).toEqual({ kind: 'none' });
	});

	it('returns orphan-status for a status matching no column', () => {
		const result = resolveStatusSwatch('vanished', [{ name: 'todo', color: '#1a7f37' }]);
		expect(result).toEqual({ kind: 'orphan-status' });
	});
});
