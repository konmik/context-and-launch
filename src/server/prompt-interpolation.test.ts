import { describe, it, expect } from 'vitest';
import { interpolatePrompt, assemblePrompt } from './prompt-interpolation.js';

// Inline copy of escapeSendKeys to avoid importing agent-launch.ts (heavy deps).
// The real function lives in src/server/agent-launch.ts.
function escapeSendKeys(text: string): string {
	return text.replace(/([+^%~(){}[\]])/g, '{$1}');
}

describe('interpolatePrompt', () => {
	it('replaces known placeholders', () => {
		const result = interpolatePrompt('Hello {{name}}, welcome to {{place}}', {
			name: 'Alice',
			place: 'Wonderland',
		});
		expect(result).toBe('Hello Alice, welcome to Wonderland');
	});

	it('leaves unknown placeholders intact', () => {
		const result = interpolatePrompt('{{known}} and {{unknown}}', { known: 'yes' });
		expect(result).toBe('yes and {{unknown}}');
	});

	it('handles multiple occurrences of the same placeholder', () => {
		const result = interpolatePrompt('{{x}} then {{x}} again', { x: 'val' });
		expect(result).toBe('val then val again');
	});

	it('returns empty string for empty template', () => {
		expect(interpolatePrompt('', { a: 'b' })).toBe('');
	});

	it('passes through template with no placeholders unchanged', () => {
		const text = 'No placeholders here.';
		expect(interpolatePrompt(text, { a: 'b' })).toBe(text);
	});

	it('does not match partial brace patterns', () => {
		expect(interpolatePrompt('{single}', { single: 'x' })).toBe('{single}');
		expect(interpolatePrompt('{{{triple}}}', { triple: 'x' })).toBe('{x}');
	});

	it('does not recursively interpolate placeholders inside substituted values', () => {
		// ticketTitle value itself contains a {{ticketDir}} placeholder string.
		// Single-pass replace means substituted text is never re-scanned,
		// so the inner placeholder must survive literally.
		const result = interpolatePrompt(
			'Work on {{ticketTitle}} in {{ticketDir}}',
			{
				ticketTitle: 'Fix {{ticketDir}} layout',
				ticketDir: 'C:\\projects\\board\\st-0001',
			},
		);
		expect(result).toBe(
			'Work on Fix {{ticketDir}} layout in C:\\projects\\board\\st-0001',
		);

		// Also confirm with a value referencing its own key (self-referential)
		const selfRef = interpolatePrompt('Name: {{name}}', {
			name: 'hello {{name}}',
		});
		expect(selfRef).toBe('Name: hello {{name}}');

		// And a chain: value of A references B, value of B references A
		const chain = interpolatePrompt('{{a}} and {{b}}', {
			a: 'see {{b}}',
			b: 'see {{a}}',
		});
		expect(chain).toBe('see {{b}} and see {{a}}');
	});

	it('does not expand regex replacement patterns in variable values', () => {
		const template = 'Result: {{val}}';
		// String replacers would interpret these as special patterns;
		// function replacers must pass them through literally.
		const cases: Record<string, string> = {
			'$1': '$1',
			'$$': '$$',
			'$&': '$&',
			"$`": '$`',
			"$'": "$'",
			'$<name>': '$<name>',
			'prefix $1 suffix': 'prefix $1 suffix',
			'$$100': '$$100',
		};
		for (const [input, expected] of Object.entries(cases)) {
			const result = interpolatePrompt(template, { val: input });
			expect(result).toBe(`Result: ${expected}`);
		}
	});
});

describe('assemblePrompt', () => {
	it('returns template text when no skills appended', () => {
		expect(assemblePrompt('base prompt', [])).toBe('base prompt');
	});

	it('appends skills with double newline separator', () => {
		const result = assemblePrompt('base', ['skill1', 'skill2']);
		expect(result).toBe('base\n\nskill1\n\nskill2');
	});

	it('appends a single skill correctly', () => {
		const result = assemblePrompt('template text', ['one skill']);
		expect(result).toBe('template text\n\none skill');
	});

	it('skill-text placeholders are substituted because assemble runs before interpolate', () => {
		const template = 'Work in {{ticketDir}} on {{ticketTitle}}';
		const skill1 = 'Read requirements from {{ticketDir}}/requirements.md';
		const skill2 = 'Project root: {{projectPath}}';

		const assembled = assemblePrompt(template, [skill1, skill2]);

		// Assemble joins everything first
		expect(assembled).toBe(
			'Work in {{ticketDir}} on {{ticketTitle}}\n\n' +
			'Read requirements from {{ticketDir}}/requirements.md\n\n' +
			'Project root: {{projectPath}}',
		);

		// Then interpolate replaces ALL placeholders in the joined text,
		// including those that originated in skill text
		const result = interpolatePrompt(assembled, {
			ticketDir: 'C:\\projects\\board\\st-0001-login',
			ticketTitle: 'Fix Login',
			projectPath: 'C:\\projects',
		});

		expect(result).toBe(
			'Work in C:\\projects\\board\\st-0001-login on Fix Login\n\n' +
			'Read requirements from C:\\projects\\board\\st-0001-login/requirements.md\n\n' +
			'Project root: C:\\projects',
		);
	});

	it('preserves triple+ newlines from trailing/leading whitespace without trimming', () => {
		// Template ends with trailing newlines
		const template = 'Do the work in {{ticketDir}}\n\n';
		// Skill starts with leading newlines
		const skill = '\n\nRead requirements from {{ticketDir}}/req.md';

		// assemblePrompt joins with \n\n, so we get:
		// template(\n\n) + separator(\n\n) + skill(\n\n...) = 6 newlines between content
		const assembled = assemblePrompt(template, [skill]);
		expect(assembled).toBe(
			'Do the work in {{ticketDir}}\n\n' +
			'\n\n' +
			'\n\nRead requirements from {{ticketDir}}/req.md',
		);

		// Count the newlines between the two content lines
		const match = assembled.match(/\{\{ticketDir\}\}(\n+)Read/);
		expect(match).not.toBeNull();
		expect(match![1].length).toBe(6); // triple double-newline

		// Newlines survive interpolatePrompt
		const interpolated = interpolatePrompt(assembled, {
			ticketDir: 'C:\\projects\\t-0001',
		});
		expect(interpolated).toBe(
			'Do the work in C:\\projects\\t-0001\n\n' +
			'\n\n' +
			'\n\nRead requirements from C:\\projects\\t-0001/req.md',
		);
		const interpMatch = interpolated.match(/t-0001(\n+)Read/);
		expect(interpMatch).not.toBeNull();
		expect(interpMatch![1].length).toBe(6);

		// Newlines survive escapeSendKeys (newlines are not special SendKeys chars)
		const escaped = escapeSendKeys(interpolated);
		const escMatch = escaped.match(/t-0001(\n+)Read/);
		expect(escMatch).not.toBeNull();
		expect(escMatch![1].length).toBe(6);

		// Newlines survive PS single-quote escaping (replace ' with '')
		const psEscaped = escaped.replace(/'/g, "''");
		const psMatch = psEscaped.match(/t-0001(\n+)Read/);
		expect(psMatch).not.toBeNull();
		expect(psMatch![1].length).toBe(6);
	});
});

describe('full pipeline with ticketDir containing parentheses', () => {
	it('interpolates, escapes SendKeys parens, and survives PS single-quote escape', () => {
		const template = 'Work in {{ticketDir}} on {{ticketTitle}}';
		const skill = 'Read requirements from {{ticketDir}}/requirements.md';
		const assembled = assemblePrompt(template, [skill]);

		const ticketDir = 'C:\\Program Files (x86)\\MyApp\\tickets\\st-0042';
		const interpolated = interpolatePrompt(assembled, {
			ticketDir,
			ticketTitle: 'Fix (critical) layout bug',
		});

		// interpolatePrompt should substitute both placeholders correctly
		expect(interpolated).toBe(
			'Work in C:\\Program Files (x86)\\MyApp\\tickets\\st-0042 on Fix (critical) layout bug\n\n' +
			'Read requirements from C:\\Program Files (x86)\\MyApp\\tickets\\st-0042/requirements.md',
		);

		// escapeSendKeys wraps ( and ) in braces
		const escaped = escapeSendKeys(interpolated);
		expect(escaped).toContain('{(}x86{)}');
		expect(escaped).toContain('{(}critical{)}');
		// No raw unescaped parens should remain
		expect(escaped).not.toMatch(/[^{]\([^}]/);

		// PS single-quote escaping should not interfere (no single quotes in this path)
		const psEscaped = escaped.replace(/'/g, "''");
		expect(psEscaped).toBe(escaped);

		// Also test a ticketDir that DOES contain a single quote alongside parens
		const dirWithQuote = "C:\\Program Files (x86)\\O'Reilly\\tickets";
		const interpolated2 = interpolatePrompt('Dir: {{ticketDir}}', {
			ticketDir: dirWithQuote,
		});
		expect(interpolated2).toBe("Dir: C:\\Program Files (x86)\\O'Reilly\\tickets");

		const escaped2 = escapeSendKeys(interpolated2);
		expect(escaped2).toContain('{(}x86{)}');

		const psEscaped2 = escaped2.replace(/'/g, "''");
		// The single quote should be doubled for PS
		expect(psEscaped2).toContain("O''Reilly");
		// Parens should still be wrapped in braces after PS escaping
		expect(psEscaped2).toContain('{(}x86{)}');
	});
});

describe('escapeSendKeys with curly braces from interpolation leftovers', () => {
	it('escapes curly braces in leftover {{unknown}} placeholders into valid SendKeys syntax', () => {
		// When interpolatePrompt leaves an unknown placeholder intact,
		// the resulting string contains literal {{ and }} which are
		// SendKeys special characters and must be escaped.
		const withLeftover = interpolatePrompt('Hello {{known}} and {{unknown}}', {
			known: 'world',
		});
		expect(withLeftover).toBe('Hello world and {{unknown}}');

		const escaped = escapeSendKeys(withLeftover);

		// Each { becomes {{} and each } becomes {}} in SendKeys escaping.
		// So {{unknown}} -> {{}{{}unknown{}}{}} (the replacements concatenate).
		// In SendKeys, {{} = literal '{' and {}} = literal '}'.
		expect(escaped).toBe('Hello world and {{}{{}unknown{}}{}}'	);

		// Verify each brace was individually escaped:
		// no raw unescaped { or } should remain outside of {X} wrappers.
		// A simple structural check: the escaped string should contain
		// exactly 4 brace-escape sequences for the 4 braces in {{unknown}}.
		const braceEscapes = escaped.match(/\{[{}]\}/g);
		expect(braceEscapes).not.toBeNull();
		expect(braceEscapes!.length).toBe(4);
	});
});

describe('FALLBACK_PROMPT used when template name and Default both missing', () => {
	// Replicate the FALLBACK_PROMPT constant from agent-launch.ts (not exported).
	const FALLBACK_PROMPT = 'Current ticket files are in {{ticketDir}}. Read the files there for context.';

	// Replicate the template selection chain from launchAgent (lines 91-94).
	function selectTemplate(
		templates: { name: string; text: string }[],
		requestedName: string,
	): string {
		return (
			templates.find(t => t.name === requestedName)?.text
			?? templates.find(t => t.name === 'Default')?.text
			?? FALLBACK_PROMPT
		);
	}

	it('falls back to FALLBACK_PROMPT when neither requested template nor Default exist', () => {
		// Templates list has entries but none matching and no Default
		const templates = [
			{ name: 'Custom Plan', text: 'Do {{ticketTitle}} work' },
			{ name: 'Review', text: 'Review {{projectPath}}' },
		];

		const selected = selectTemplate(templates, 'Nonexistent Template');
		expect(selected).toBe(FALLBACK_PROMPT);
	});

	it('falls back to FALLBACK_PROMPT when templates list is empty', () => {
		const selected = selectTemplate([], 'Default');
		expect(selected).toBe(FALLBACK_PROMPT);
	});

	it('FALLBACK_PROMPT contains {{ticketDir}} and interpolates correctly with a Windows path', () => {
		const ticketDir = 'C:\\Users\\dev\\tickets\\proj-1-login-fix';
		const result = interpolatePrompt(FALLBACK_PROMPT, { ticketDir });
		expect(result).toBe(
			`Current ticket files are in ${ticketDir}. Read the files there for context.`,
		);
		// No leftover placeholders
		expect(result).not.toContain('{{');
	});

	it('FALLBACK_PROMPT interpolation through full pipeline (assemble, interpolate, escapeSendKeys)', () => {
		const templates: { name: string; text: string }[] = [];
		const templateText = selectTemplate(templates, 'Gone Template');
		expect(templateText).toBe(FALLBACK_PROMPT);

		// Add a skill to exercise assemblePrompt with the fallback
		const skillTexts = ['Also check {{projectPath}} for config files.'];
		const assembled = assemblePrompt(templateText, skillTexts);
		expect(assembled).toBe(
			FALLBACK_PROMPT + '\n\nAlso check {{projectPath}} for config files.',
		);

		const ticketDir = 'C:\\Program Files (x86)\\projects\\st-0042-bug';
		const variables: Record<string, string> = {
			ticketDir,
			ticketTitle: 'Fix bug',
			ticketNumber: 'ST-0042',
			ticketStatus: 'todo',
			projectPath: 'C:\\Program Files (x86)\\projects',
			projectSlug: 'my-project',
		};

		const interpolated = interpolatePrompt(assembled, variables);
		// ticketDir and projectPath both substituted
		expect(interpolated).toContain(ticketDir);
		expect(interpolated).toContain('C:\\Program Files (x86)\\projects');
		expect(interpolated).not.toContain('{{ticketDir}}');
		expect(interpolated).not.toContain('{{projectPath}}');

		// escapeSendKeys handles parentheses in the path
		const escaped = escapeSendKeys(interpolated);
		expect(escaped).toContain('{(}x86{)}');
	});

	it('prefers Default template over FALLBACK_PROMPT when requested name is missing', () => {
		const templates = [
			{ name: 'Default', text: 'Default template: {{ticketDir}}' },
			{ name: 'Other', text: 'Other template' },
		];

		const selected = selectTemplate(templates, 'Nonexistent');
		expect(selected).toBe('Default template: {{ticketDir}}');
		// Confirms the fallback chain: requested -> Default -> FALLBACK_PROMPT
	});
});

describe('escapeSendKeys edge cases: empty and all-special strings', () => {
	it('returns empty string for empty input without crashing', () => {
		const result = escapeSendKeys('');
		expect(result).toBe('');
	});

	it('correctly escapes a string composed entirely of special characters', () => {
		// Every SendKeys special character: + ^ % ~ ( ) { } [ ]
		const allSpecials = '+^%~(){}[]';
		const result = escapeSendKeys(allSpecials);

		// Each character should be wrapped in braces: {+}{^}{%}{~}{(}{)}{{}{}}{[}{]}
		expect(result).toBe('{+}{^}{%}{~}{(}{)}{{}{}}{[}{]}');

		// No raw special characters should remain outside brace wrappers
		// Check that every special char is enclosed
		for (const ch of ['+', '^', '%', '~', '(', ')']) {
			expect(result).toContain(`{${ch}}`);
		}
		expect(result).toContain('{[}');
		expect(result).toContain('{]}');

		// The result length should be 3 chars per special (brace-wrapped),
		// except { and } which produce {{}  and {}} (3 chars each)
		expect(result.length).toBe(10 * 3); // 10 specials, each wrapped = 30 chars
	});

	it('handles repeated special characters without crash', () => {
		const repeated = '+++^^^%%%~~~';
		const result = escapeSendKeys(repeated);
		expect(result).toBe('{+}{+}{+}{^}{^}{^}{%}{%}{%}{~}{~}{~}');
	});
});
