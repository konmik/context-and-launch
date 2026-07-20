import { For, Show } from 'solid-js';
import { TabsContent } from '../ui/tabs.js';
import { COMMAND_TEMPLATE_GROUP_ORDER } from '~/core/command-template/command-template-types.js';
import type { CommandTemplateSettingsController } from './command-template-settings-state.js';

export function CommandTemplatesTab(props: { controller: CommandTemplateSettingsController }) {
	return (
		<TabsContent value="command-templates">
			<Show when={props.controller.loading()}>
				<p class="text-sm text-muted-foreground">Loading Command Templates...</p>
			</Show>
			<p class="mb-4 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
				Trusted local code: these scripts run with your user permissions in the platform shell.
			</p>
			<div class="space-y-3" data-testid="command-template-list">
				<For each={COMMAND_TEMPLATE_GROUP_ORDER}>{(group) => {
					const rows = () => props.controller.entries().filter((entry) => entry.featureGroup === group);
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
										>{entry.isOverridden ? 'Override' : 'Default'}</span>
									</div>
									<textarea
										class="input mt-2 w-full resize-none font-mono text-xs"
										style={{ 'field-sizing': 'content' }}
										rows={1}
										value={props.controller.scriptFor(entry)}
										onInput={(event) =>
											props.controller.setDraft(entry.key, event.currentTarget.value)}
										data-testid="command-template-editor-script"
									/>
									<p class="mt-2 text-xs text-muted-foreground">
										Known placeholders:{' '}
										{entry.knownPlaceholders.map((name) => `{{${name}}}`).join(' ') || 'none'}
									</p>
									<div class="mt-2 flex justify-end gap-2">
										<button
											class="btn-secondary"
											disabled={!entry.isOverridden}
											onClick={() => void props.controller.reset(entry.key)}
											data-testid="command-template-reset"
										>Reset</button>
										<button
											class="btn-primary"
											disabled={!props.controller.isDirty(entry)}
											onClick={() => void props.controller.save(entry)}
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
