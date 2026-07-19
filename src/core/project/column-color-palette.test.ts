import { describe, it, expect } from 'vitest';
import { COLUMN_COLOR_PALETTE, requireColumnColor } from './column-color-palette.js';

describe('column color palette', () => {
	it('has exactly 12 entries', () => {
		expect(COLUMN_COLOR_PALETTE).toHaveLength(12);
	});

	it('has distinct names and hexes', () => {
		const names = new Set(COLUMN_COLOR_PALETTE.map(o => o.name));
		const hexes = new Set(COLUMN_COLOR_PALETTE.map(o => o.hex));
		expect(names.size).toBe(12);
		expect(hexes.size).toBe(12);
	});

	it('accepts every palette hex', () => {
		for (const option of COLUMN_COLOR_PALETTE) {
			expect(requireColumnColor(option.hex)).toBe(option.hex);
		}
	});

	it('rejects a non-palette hex', () => {
		expect(() => requireColumnColor('#123456')).toThrow('not in the preset palette');
	});
});
