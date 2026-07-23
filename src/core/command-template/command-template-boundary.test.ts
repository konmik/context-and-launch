import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMMAND_TEMPLATE_DEFINITION_BY_KEY } from './command-template-definitions.js';

function filesBelow(root: string): string[] {
	return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
		const file = path.join(root, entry.name);
		return entry.isDirectory() ? filesBelow(file) : [file];
	});
}

/** Prose in doc comments describes these patterns; only real code should be judged. */
function codeWithoutComments(file: string): string {
	return fs.readFileSync(file, 'utf8')
		.split('\n')
		.filter((line) => !/^\s*(?:\/\/|\*|\/\*)/.test(line))
		.join('\n');
}

const isTestInfrastructure = (file: string): boolean =>
	/\.test\.|\.test-cases\.|\.shell\.test\.|test-git\.ts$|test-utils\.ts$|survival-fixture/.test(file);

describe('Command Template architecture boundary', () => {
	it('isolates child-process imports to the fixed runner and test infrastructure', () => {
		const offenders = filesBelow(path.resolve('src'))
			.filter((file) => /\.(ts|tsx)$/.test(file))
			.filter((file) => !isTestInfrastructure(file))
			.filter((file) => /(?:node:)?child_process|cross-spawn/.test(fs.readFileSync(file, 'utf8')))
			.filter((file) => !file.endsWith(path.join('command-template', 'platform-shell-runner.ts')));
		expect(offenders).toEqual([]);
	});

	// Unknown key strings are now a compile error, because CommandTemplateKey is
	// derived from the catalog. What types cannot express is that a key must stay
	// a literal: a template literal would satisfy the union while hiding which
	// action runs. Platform families go through platformCommandTemplateKey instead.
	it('never builds a Command Template key by interpolation', () => {
		const interpolatedKey = /\.execute(?:Sync)?\(\s*`/;
		const offenders = filesBelow(path.resolve('src'))
			.filter((file) => /\.(ts|tsx)$/.test(file))
			.filter((file) => !isTestInfrastructure(file))
			.filter((file) => interpolatedKey.test(fs.readFileSync(file, 'utf8')));
		expect(offenders).toEqual([]);
	});

	it('has a production consumer for every catalog action', () => {
		const production = filesBelow(path.resolve('src'))
			.filter((file) => /\.(ts|tsx)$/.test(file))
			.filter((file) => !isTestInfrastructure(file))
			.filter((file) => !file.endsWith('command-template-definitions.ts'))
			.map((file) => fs.readFileSync(file, 'utf8'))
			.join('\n');
		// Platform-suffixed actions are consumed through platformCommandTemplateKey,
		// so the family name is what appears in production, not the full key.
		const dynamicFamilies = new Map<string, RegExp>([
			['picker.files.', /'picker\.files'/],
			['picker.directory.', /'picker\.directory'/],
			['open.directory.', /'open\.directory'/],
		]);
		const orphaned = [...COMMAND_TEMPLATE_DEFINITION_BY_KEY.keys()].filter((key) => {
			if (production.includes(`'${key}'`) || production.includes(`"${key}"`)) return false;
			const family = [...dynamicFamilies.entries()].find(([prefix]) => key.startsWith(prefix));
			return !family || !family[1].test(production);
		});
		expect(orphaned).toEqual([]);
	});

	it('keeps executable names out of production TypeScript', () => {
		const executableNameFollowedByAnArgument = new RegExp(
			'^\\s*(?:&\\s*)?(?:git|herdr|claude|osascript|lsof|xdg-open|zenity|kdialog'
			+ '|explorer(?:\\.exe)?|launchctl|expect|pwsh|powershell|wt|open|bash|sh)'
			+ '(?:\\.exe)?\\s+[-\\w{$\'"]',
		);
		const offenders = filesBelow(path.resolve('src'))
			.filter((file) => /\.(ts|tsx)$/.test(file))
			.filter((file) => !isTestInfrastructure(file))
			.filter((file) => !file.includes(`${path.sep}command-template${path.sep}`))
			.filter((file) => {
				const code = codeWithoutComments(file);
				return [...code.matchAll(/'([^']*)'|"([^"]*)"|`([^`]*)`/g)]
					.some((match) => executableNameFollowedByAnArgument.test(match[1] ?? match[2] ?? match[3] ?? ''));
			});
		expect(offenders).toEqual([]);
	});

	it('keeps shell escaping out of production feature code', () => {
		const offenders = filesBelow(path.resolve('src'))
			.filter((file) => /\.(ts|tsx)$/.test(file))
			.filter((file) => !isTestInfrastructure(file))
			.filter((file) => !file.includes(`${path.sep}command-template${path.sep}`))
			.filter((file) => /\bshellLiteral\b/.test(fs.readFileSync(file, 'utf8')));
		expect(offenders).toEqual([]);
	});

	// A command body is an opaque payload. Matching against one -- a Profile,
	// a Shortcut, or an already rendered script -- means behavior depends on text
	// the user can edit, which is how string-rewriting workarounds creep back in.
	it('never inspects a command body to decide behavior', () => {
		const inspected = '(?:profile|shortcut)\\.command|renderedScript|\\brender\\([^)]*\\)';
		const inspection = new RegExp(
			`\\b(?:${inspected})\\s*(?:\\.(?:includes|match|replace|startsWith|endsWith|indexOf|search)\\b`
			+ `|[=!]==)|\\.test\\(\\s*(?:${inspected})`,
			'i',
		);
		const offenders = filesBelow(path.resolve('src'))
			.filter((file) => /\.(ts|tsx)$/.test(file))
			.filter((file) => !isTestInfrastructure(file))
			.filter((file) => !file.endsWith(path.join('command-template', 'command-template-service.ts')))
			.filter((file) => inspection.test(fs.readFileSync(file, 'utf8')));
		expect(offenders).toEqual([]);
	});

	// The classified failure kinds exist so callers stop pattern-matching shell
	// text. Reintroducing that coupling would silently break on a locale change.
	it('never decides control flow by matching process error text', () => {
		const errorTextMatched = /\b(?:not recognized|CommandNotFoundException|timed out|cancell?ed|-128)\b/i;
		const offenders = filesBelow(path.resolve('src'))
			.filter((file) => /\.(ts|tsx)$/.test(file))
			.filter((file) => !isTestInfrastructure(file))
			.filter((file) => {
				const code = codeWithoutComments(file);
				return [...code.matchAll(/\/(?:[^/\\\n]|\\.)+\/[gimsuy]*/g)]
					.some((match) => errorTextMatched.test(match[0]));
			});
		expect(offenders).toEqual([]);
	});

});
