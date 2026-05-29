export function joinClass(base: string, extra?: string): string {
	return extra ? `${base} ${extra}` : base;
}
