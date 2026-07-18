import { describe, it, expect } from 'vitest';
import { interpolatePrompt } from './prompt-interpolation.js';

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

describe('{{skills}} interpolation', () => {
	it('expands {{skills}} with joined skill texts', () => {
		const template = 'Do the work.\n\n{{skills}}';
		const result = interpolatePrompt(template, { skills: 'skill1\nskill2' });
		expect(result).toBe('Do the work.\n\nskill1\nskill2');
	});

	it('expands {{skills}} to empty string when no skills checked', () => {
		const template = 'Do the work.\n\n{{skills}}';
		const result = interpolatePrompt(template, { skills: '' });
		expect(result).toBe('Do the work.\n\n');
	});

	it('template without {{skills}} ignores skill texts', () => {
		const template = 'Just do the thing.';
		const result = interpolatePrompt(template, { skills: 'skill1\nskill2' });
		expect(result).toBe('Just do the thing.');
	});

	it('{{skills}} and other variables expand in a single pass', () => {
		const template = 'Work in {{ticketDir}}.\n\n{{skills}}';
		const result = interpolatePrompt(template, {
			ticketDir: 'C:\\projects\\t-0001',
			skills: '/simplify',
		});
		expect(result).toBe('Work in C:\\projects\\t-0001.\n\n/simplify');
	});
});
