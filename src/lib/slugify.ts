export function slugifyColumnName(input: string): string {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9 -]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
}
