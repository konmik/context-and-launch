import { createEffect, createSignal, on } from 'solid-js';
import { revalidate } from '@solidjs/router';
import { errorPayload, type ErrorInfo } from '~/core/shared/errors.js';
import type { CommandTemplateKey } from '~/core/command-template/command-template-definitions.js';
import {
	getCommandTemplates, resetCommandTemplate, saveCommandTemplate,
	type CommandTemplateView,
} from './command-template-api.js';

export function createCommandTemplateSettingsState(props: { open: boolean }) {
	const [entries, setEntries] = createSignal<CommandTemplateView[]>([]);
	const [loading, setLoading] = createSignal(false);
	const [error, setError] = createSignal<ErrorInfo | null>(null);
	const [drafts, setDrafts] = createSignal<Record<string, string>>({});

	createEffect(on(() => props.open, (open) => {
		if (open) void load();
		else setDrafts({});
	}));

	async function load(): Promise<void> {
		setLoading(true);
		setError(null);
		try {
			void revalidate('command-templates');
			setEntries(await getCommandTemplates());
			setDrafts({});
		} catch (cause) {
			setError(errorPayload(cause, 'Command Templates failed to load'));
		} finally {
			setLoading(false);
		}
	}

	function replaceEntry(entry: CommandTemplateView): void {
		setEntries((current) => current.map((item) => item.key === entry.key ? entry : item));
	}

	function clearDraft(key: CommandTemplateKey): void {
		setDrafts(({ [key]: _removed, ...rest }) => rest);
	}

	function scriptFor(entry: CommandTemplateView): string {
		const draft = drafts()[entry.key];
		return draft ?? entry.script;
	}

	function isDirty(entry: CommandTemplateView): boolean {
		const draft = drafts()[entry.key];
		return draft !== undefined && draft !== entry.script;
	}

	function setDraft(key: CommandTemplateKey, script: string): void {
		setDrafts((current) => ({ ...current, [key]: script }));
	}

	async function save(entry: CommandTemplateView): Promise<void> {
		const result = await saveCommandTemplate(entry.key, scriptFor(entry));
		if (!result.ok) {
			setError({ title: 'Save failed', description: result.message });
			return;
		}
		replaceEntry(result.entry);
		clearDraft(entry.key);
	}

	async function reset(key: CommandTemplateKey): Promise<void> {
		const result = await resetCommandTemplate(key);
		if (!result.ok) {
			setError({ title: 'Reset failed', description: result.message });
			return;
		}
		replaceEntry(result.entry);
		clearDraft(key);
	}

	return {
		entries, loading, error, setError,
		scriptFor, isDirty, setDraft, save, reset, load,
	};
}

export type CommandTemplateSettingsController = ReturnType<typeof createCommandTemplateSettingsState>;
