export function interpolatePrompt(text: string, variables: Record<string, string>): string {
	return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
		return key in variables ? variables[key] : match;
	});
}
