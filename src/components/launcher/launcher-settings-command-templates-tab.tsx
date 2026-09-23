import { For, Show, createMemo, createSignal, useContext } from 'solid-js';
import { TabsContent } from '../ui/tabs.js';
import { COMMAND_TEMPLATE_GROUP_ORDER } from '~/core/command-template/command-template-types.js';
import {
	COMMAND_TEMPLATE_DEFAULTS, type CommandTemplateKey,
} from '~/core/command-template/command-template-definitions.js';
import type { CommandTemplateOverrides } from '~/core/command-template/command-template-types.js';
import type { ErrorInfo } from '~/core/shared/errors.js';
import { CommandTemplateContext } from './command-template-storage.js';
import { getCommandTemplateDefinitions } from './command-template-api.js';
import ErrorDialog from '../shared/ErrorDialog.js';

export function CommandTemplatesTab() {
	const templates = useContext(CommandTemplateContext)!;
	const definitions = createMemo(() => getCommandTemplateDefinitions());
	const [drafts, setDrafts] = createSignal<CommandTemplateOverrides>({});
	const [error, setError] = createSignal<ErrorInfo | null>(null);
	const savedScript = (key: CommandTemplateKey) => templates.get()[key] ?? COMMAND_TEMPLATE_DEFAULTS[key];
	const scriptFor = (key: CommandTemplateKey) => drafts()[key] ?? savedScript(key);
	async function save(key: CommandTemplateKey, script: string) {
		const result = await templates.update(current => {
			const { [key]: _removed, ...rest } = current;
			return script === COMMAND_TEMPLATE_DEFAULTS[key] ? rest : { ...rest, [key]: script };
		});
		if (result.type === 'Failure') setError({ title: 'Save failed', description: result.error });
		else setDrafts(({ [key]: _removed, ...rest }) => rest);
	}
	return (
		<TabsContent value="command-templates">
			<ErrorDialog error={error()} onClose={() => setError(null)} />
			<p class="mb-4 rounded border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
				Trusted local code: these scripts run with your user permissions in the platform shell.
			</p>
			<div class="space-y-3" data-testid="command-template-list">
				<For each={COMMAND_TEMPLATE_GROUP_ORDER}>{(group) => {
					const rows = () => definitions().filter((entry) => entry.featureGroup === group);
					return <Show when={rows().length > 0}>
						<details
							class="rounded-md border border-border"
							data-testid="command-template-group"
							data-command-template-group={group}
						>
							<summary
								class="cursor-pointer select-none px-3 py-2 text-sm font-semibold"
								data-testid="command-template-group-toggle"
							>{group}</summary>
							<div class="divide-y divide-border border-t border-border">
								<For each={rows()}>{(entry) => <article
									class="p-3"
									data-testid="command-template-row"
									data-command-template-key={entry.key}
								>
									<div class="flex items-start justify-between gap-3">
										<div class="min-w-0">
											<div class="text-sm font-medium">{entry.label}</div>
											<code class="text-xs text-muted-foreground">{entry.key}</code>
										</div>
										<span
											class="rounded bg-muted px-2 py-0.5 text-xs"
											data-testid="command-template-override-state"
										>{Object.hasOwn(templates.get(), entry.key) ? 'Override' : 'Default'}</span>
									</div>
									<textarea
										class="input mt-2 w-full resize-none font-mono text-xs"
										style={{ 'field-sizing': 'content' }}
										rows={1}
										value={scriptFor(entry.key)}
										onInput={(event) =>
											setDrafts(current => ({
												...current, [entry.key]: event.currentTarget.value,
											}))}
										data-testid="command-template-editor-script"
									/>
									<p class="mt-2 text-xs text-muted-foreground">
										Known placeholders:{' '}
										{[...entry.scalarPlaceholders, ...entry.listPlaceholders]
											.map((name) => `{{${name}}}`).join(' ') || 'none'}
									</p>
									<div class="mt-2 flex justify-end gap-2">
										<button
											class="btn-secondary"
											disabled={!Object.hasOwn(templates.get(), entry.key)}
											onClick={() => void save(entry.key, COMMAND_TEMPLATE_DEFAULTS[entry.key])}
											data-testid="command-template-reset"
										>Reset</button>
										<button
											class="btn-primary"
											disabled={scriptFor(entry.key) === savedScript(entry.key)}
											onClick={() => void save(entry.key, scriptFor(entry.key))}
											data-testid="command-template-editor-save"
										>Save</button>
									</div>
								</article>}</For>
							</div>
						</details>
					</Show>;
				}}</For>
			</div>
		</TabsContent>
	);
}
