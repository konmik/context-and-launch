import type {
	CommandTemplatePlatform, CommandTemplateValue, CommandTemplateValues,
} from './command-template-types.js';

export const PLACEHOLDER_SOURCE = '\\{\\{([^{}]+)\\}\\}';
export const PATH_SUFFIX_SOURCE = '[\\\\/][^\\s"\'`|;&(){}\\[\\]]*';

const PLACEHOLDER_PATTERN = new RegExp(PLACEHOLDER_SOURCE, 'g');
const PLACEHOLDER_WITH_PATH_SUFFIX_PATTERN = new RegExp(
	`${PLACEHOLDER_SOURCE}(${PATH_SUFFIX_SOURCE})?`, 'g',
);

/**
 * Names a script references that the action does not declare. A template body is
 * edited by hand, so a misspelled name would otherwise survive interpolation as
 * literal `{{text}}` and reach the command as an argument.
 */
export function undeclaredPlaceholders(
	script: string,
	knownScalarPlaceholders: readonly string[],
	knownListPlaceholders: readonly string[],
): string[] {
	const known = new Set([...knownScalarPlaceholders, ...knownListPlaceholders]);
	const undeclared = new Set<string>();
	for (const match of script.matchAll(PLACEHOLDER_PATTERN)) {
		if (!known.has(match[1])) undeclared.add(match[1]);
	}
	return [...undeclared];
}

export function shellLiteral(value: string, platform: CommandTemplatePlatform): string {
	if (platform === 'windows') return `'${value.replaceAll("'", "''")}'`;
	return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function renderValue(value: CommandTemplateValue, platform: CommandTemplatePlatform): string {
	if (typeof value === 'string') return shellLiteral(value, platform);
	return value.map((item) => shellLiteral(item, platform)).join(' ');
}

export function interpolateCommandTemplate(
	script: string,
	values: CommandTemplateValues,
	knownScalarPlaceholders: readonly string[],
	knownListPlaceholders: readonly string[],
	platform: CommandTemplatePlatform,
): string {
	const known = new Set([...knownScalarPlaceholders, ...knownListPlaceholders]);
	// Render from the original script in one pass. Repeated replaceAll calls would
	// rescan an already escaped runtime value, so a literal value such as
	// "{{otherKnownValue}}" could accidentally be interpreted as template syntax.
	return script.replace(PLACEHOLDER_WITH_PATH_SUFFIX_PATTERN, (
		placeholder, name: string, pathSuffix: string | undefined,
	) => {
		if (!known.has(name) || !Object.hasOwn(values, name)) return placeholder;
		const value = values[name];
		if (value === undefined) return placeholder;
		// PowerShell does not concatenate a quoted argument with an adjacent path
		// suffix: 'C:\dir'/tool.ps1 becomes two argv entries. Fold a static suffix
		// into scalar values before quoting so existing Profile bodies such as
		// {{configDefaultsDir}}/run-agent.ps1 remain one safely escaped argument.
		if (pathSuffix && typeof value === 'string') {
			return renderValue(`${value}${pathSuffix}`, platform);
		}
		return `${renderValue(value, platform)}${pathSuffix ?? ''}`;
	});
}
