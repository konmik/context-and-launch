export function interpolatePrompt(text: string, variables: Record<string, string>): string {
	return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
		return key in variables ? variables[key] : match;
	});
}

export function assemblePrompt(templateText: string, skillTexts: string[]): string {
	if (skillTexts.length === 0) return templateText;
	return [templateText, ...skillTexts].join('\n\n');
}
