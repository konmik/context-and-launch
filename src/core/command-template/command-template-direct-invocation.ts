import { PATH_SUFFIX_SOURCE, PLACEHOLDER_SOURCE } from './command-template-interpolation.js';
import type { CommandTemplateValues } from './command-template-types.js';

const placeholderToken = new RegExp(`^${PLACEHOLDER_SOURCE}$`);
// A scalar placeholder at the start of a token followed by a static path suffix,
// composed from the interpolation grammar so {{configDefaultsDir}}/run-agent.ps1
// folds into one argv entry instead of forcing the shell-string fallback.
const placeholderWithPathSuffixToken = new RegExp(`^${PLACEHOLDER_SOURCE}(${PATH_SUFFIX_SOURCE})$`);
const plainToken = /^[A-Za-z0-9_\-./:=@+\\]+$/;
const singleQuotedToken = /^'([^']*)'$/;

export function buildDirectInvocationArgv(
	script: string,
	values: CommandTemplateValues,
	knownScalarPlaceholders: readonly string[],
	knownListPlaceholders: readonly string[],
): readonly string[] | undefined {
	const line = script.trim();
	if (!line || /[\r\n]/.test(line)) return undefined;
	const tokens = line.split(/\s+/);
	// The program itself may be a placeholder (the Herdr executable is supplied at
	// runtime). Its resolved value is validated below like any other token.
	if (!plainToken.test(tokens[0]) && !placeholderToken.test(tokens[0])) return undefined;
	const scalarNames = new Set(knownScalarPlaceholders);
	const listNames = new Set(knownListPlaceholders);
	const argv: string[] = [];
	for (const token of tokens) {
		const placeholder = placeholderToken.exec(token);
		if (placeholder) {
			const name = placeholder[1];
			const value = Object.hasOwn(values, name) ? values[name] : undefined;
			if (scalarNames.has(name) && typeof value === 'string') {
				argv.push(value);
			} else if (listNames.has(name) && typeof value === 'object') {
				argv.push(...value);
			} else {
				return undefined;
			}
			continue;
		}
		const suffixed = placeholderWithPathSuffixToken.exec(token);
		if (suffixed) {
			const [, name, pathSuffix] = suffixed;
			const value = Object.hasOwn(values, name) ? values[name] : undefined;
			if (!scalarNames.has(name) || typeof value !== 'string') return undefined;
			argv.push(`${value}${pathSuffix}`);
			continue;
		}
		const quoted = singleQuotedToken.exec(token);
		if (quoted) {
			argv.push(quoted[1]);
			continue;
		}
		if (!plainToken.test(token)) return undefined;
		argv.push(token);
	}
	return argv;
}
