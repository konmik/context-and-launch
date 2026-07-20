import { describe, expect, it } from 'vitest';
import { interpolateCommandTemplate, shellLiteral } from './command-template-interpolation.js';

describe('Command Template interpolation', () => {
	it('escapes scalar and list values and leaves unknown placeholders unchanged', () => {
		const rendered = interpolateCommandTemplate(
			'run {{scalar}} {{items}} {{unknown}}',
			{ scalar: "a b'$;&`{}\nline", items: ['one two', "three's"] },
			['scalar'], ['items'], 'linux',
		);
		expect(rendered).toContain(shellLiteral("a b'$;&`{}\nline", 'linux'));
		expect(rendered).toContain(`${shellLiteral('one two', 'linux')} ${shellLiteral("three's", 'linux')}`);
		expect(rendered).toContain('{{unknown}}');
	});

	it('supports empty values and PowerShell single quotes', () => {
		expect(shellLiteral('', 'windows')).toBe("''");
		expect(shellLiteral("it's", 'windows')).toBe("'it''s'");
	});

	it('does not reinterpret placeholder text contained in a runtime value', () => {
		expect(interpolateCommandTemplate(
			'run {{first}} {{second}}',
			{ first: '{{second}}', second: 'replacement' },
			['first', 'second'], [], 'windows',
		)).toBe("run '{{second}}' 'replacement'");
	});

	it('quotes an interpolated directory and its static path suffix as one argument', () => {
		expect(interpolateCommandTemplate(
			'powershell -File {{configDefaultsDir}}/run-agent.ps1',
			{ configDefaultsDir: 'C:\\Program Files\\context-launch\\config-defaults' },
			['configDefaultsDir'], [], 'windows',
		)).toBe(
			"powershell -File 'C:\\Program Files\\context-launch\\config-defaults/run-agent.ps1'",
		);
	});
});
