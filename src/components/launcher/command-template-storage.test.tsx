import { afterEach, expect, it } from 'vitest';
import { Loading } from 'solid-js';
import { cleanup, fireEvent, render, waitFor } from '~/test-render.js';
import { createStoredSignal } from '~/util/stored-signal.js';
import { fail, succeed } from '~/util/result.js';
import { COMMAND_TEMPLATE_DEFAULTS } from '~/core/command-template/command-template-definitions.js';
import type { CommandTemplateOverrides } from '~/core/command-template/command-template-types.js';
import { CommandTemplateContext } from './command-template-storage.js';
import { CommandTemplatesTab } from './launcher-settings-command-templates-tab.js';
import { TabsRoot } from '../ui/tabs.js';

afterEach(cleanup);

it('shares saved overrides between editors, retaining a failed draft and propagating reset', async () => {
	let persisted: CommandTemplateOverrides = {};
	let reject = false;
	const storage = createStoredSignal<CommandTemplateOverrides>(() => ({}), async transform => {
		if (reject) return fail('write failed');
		persisted = transform(persisted);
		return succeed(persisted);
	});
	const { container } = render(() => <Loading>
		<CommandTemplateContext value={storage}>
			<TabsRoot value="command-templates" onValueChange={() => {}}><CommandTemplatesTab /></TabsRoot>
			<TabsRoot value="command-templates" onValueChange={() => {}}><CommandTemplatesTab /></TabsRoot>
		</CommandTemplateContext>
	</Loading>);
	const fields = () => [...container.querySelectorAll<HTMLTextAreaElement>(
		'[data-command-template-key="git.version"] textarea')];
	const buttons = (id: string) => container.querySelectorAll<HTMLButtonElement>(
		`[data-command-template-key="git.version"] [data-testid="${id}"]`);
	await waitFor(() => expect(fields()).toHaveLength(2));
	fireEvent.input(fields()[0], { target: { value: 'custom version' } });
	await waitFor(() => expect(buttons('command-template-editor-save')[0].disabled).toBe(false));
	fireEvent.click(buttons('command-template-editor-save')[0]);
	await waitFor(() => expect(fields().map(field => field.value)).toEqual(['custom version', 'custom version']));
	expect(persisted).toEqual({ 'git.version': 'custom version' });

	reject = true;
	fireEvent.input(fields()[0], { target: { value: 'failed draft' } });
	await waitFor(() => expect(buttons('command-template-editor-save')[0].disabled).toBe(false));
	fireEvent.click(buttons('command-template-editor-save')[0]);
	await waitFor(() => expect(document.body.textContent).toContain('write failed'));
	expect(fields().map(field => field.value)).toEqual(['failed draft', 'custom version']);
	expect(storage.get()).toEqual({ 'git.version': 'custom version' });

	reject = false;
	fireEvent.click(buttons('command-template-reset')[0]);
	await waitFor(() => expect(fields().map(field => field.value))
		.toEqual([COMMAND_TEMPLATE_DEFAULTS['git.version'], COMMAND_TEMPLATE_DEFAULTS['git.version']]));
	expect(persisted).toEqual({});
});
