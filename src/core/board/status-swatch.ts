export interface SwatchColumn {
	name: string;
	color?: string;
}

export type StatusSwatchAppearance =
	| { kind: 'column-color'; hex: string }
	| { kind: 'orphan-status' }
	| { kind: 'none' };

export function resolveStatusSwatch(
	ticketStatus: string,
	columns: SwatchColumn[],
): StatusSwatchAppearance {
	const column = columns.find(c => c.name === ticketStatus);
	if (!column) return { kind: 'orphan-status' };
	if (!column.color) return { kind: 'none' };
	return { kind: 'column-color', hex: column.color };
}
