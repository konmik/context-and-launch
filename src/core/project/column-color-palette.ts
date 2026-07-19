export interface ColumnColorOption {
	name: string;
	hex: string;
}

export const COLUMN_COLOR_PALETTE: ColumnColorOption[] = [
	{ name: 'gray', hex: '#6e7781' },
	{ name: 'blue', hex: '#0969da' },
	{ name: 'green', hex: '#1a7f37' },
	{ name: 'yellow', hex: '#bf8700' },
	{ name: 'orange', hex: '#bc4c00' },
	{ name: 'red', hex: '#cf222e' },
	{ name: 'purple', hex: '#8250df' },
	{ name: 'pink', hex: '#bf3989' },
	{ name: 'teal', hex: '#1b7c83' },
	{ name: 'cyan', hex: '#0598bc' },
	{ name: 'lime', hex: '#4d8400' },
	{ name: 'brown', hex: '#9a6700' },
];

export function requireColumnColor(hex: string): string {
	if (!COLUMN_COLOR_PALETTE.some(option => option.hex === hex)) {
		throw new Error(`Column color "${hex}" is not in the preset palette`);
	}
	return hex;
}
