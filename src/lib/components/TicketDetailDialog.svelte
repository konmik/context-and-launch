<script lang="ts">
	import type { TicketInfo } from '$lib/types.js';
	import { Carta, MarkdownEditor } from 'carta-md';
	import 'carta-md/default.css';

	let {
		open = $bindable(false),
		slug,
		ticket,
		columns = []
	}: {
		open: boolean;
		slug: string;
		ticket: TicketInfo | null;
		columns: string[];
	} = $props();

	const carta = new Carta();

	let activeTab = $state('');
	let content = $state('');
	let savedContent = $state('');
	let loading = $state(false);
	let saving = $state(false);
	let confirmingClose = $state(false);

	$effect(() => {
		if (open && ticket && columns.length > 0) {
			activeTab = columns[0];
		}
	});

	$effect(() => {
		if (open && ticket && activeTab) {
			loadStage(activeTab);
		}
	});

	async function loadStage(stage: string) {
		if (!ticket) return;
		loading = true;
		content = '';
		try {
			const res = await fetch(
				`/api/projects/${slug}/board/tickets/${ticket.folderName}/stages/${stage}`
			);
			if (res.ok) {
				const data = await res.json();
				content = data.content;
			} else if (res.status === 404) {
				content = '';
			}
			savedContent = content;
		} catch {
			content = '';
			savedContent = '';
		} finally {
			loading = false;
		}
	}

	async function saveStage() {
		if (!ticket || !activeTab) return;
		saving = true;
		try {
			await fetch(
				`/api/projects/${slug}/board/tickets/${ticket.folderName}/stages/${activeTab}`,
				{
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ content })
				}
			);
			savedContent = content;
		} catch {
			// swallow
		} finally {
			saving = false;
		}
	}

	function close() {
		if (content !== savedContent) {
			confirmingClose = true;
			return;
		}
		open = false;
	}

	function forceClose() {
		confirmingClose = false;
		open = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (confirmingClose) {
				confirmingClose = false;
			} else {
				close();
			}
		}
	}
</script>

{#if open && ticket}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
		onkeydown={handleKeydown}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="fixed inset-0" onclick={close}></div>
		<div
			class="relative z-10 flex h-[80vh] w-full max-w-3xl flex-col rounded-lg border border-border bg-card shadow-lg"
		>
			<div class="border-b border-border p-4">
				<h2 class="text-lg font-semibold">
					{ticket.number} - {ticket.title}
				</h2>
			</div>

			<div class="flex border-b border-border">
				{#each columns as col}
					<button
						class="px-4 py-2 text-sm font-medium transition-colors {activeTab === col
							? 'border-b-2 border-primary text-foreground'
							: 'text-muted-foreground hover:text-foreground'}"
						onclick={() => (activeTab = col)}
					>
						{col}
					</button>
				{/each}
			</div>

			<div class="flex-1 overflow-hidden p-4">
				{#if loading}
					<div class="flex h-full items-center justify-center">
						<div
							class="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
						></div>
					</div>
				{:else}
					<div class="carta-wrapper h-full">
						<MarkdownEditor {carta} bind:value={content} mode="tabs" placeholder="Write markdown here..." />
					</div>
				{/if}
			</div>

			<div class="flex justify-end gap-2 border-t border-border p-4">
				<button
					type="button"
					onclick={close}
					class="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
				>
					Close
				</button>
				<button
					type="button"
					onclick={saveStage}
					disabled={saving || loading || content === savedContent}
					class="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
				>
					{saving ? 'Saving...' : 'Save'}
				</button>
			</div>
		</div>
	</div>
{/if}

{#if confirmingClose}
	<div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
		<div class="relative z-10 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
			<h2 class="mb-4 text-lg font-semibold">Unsaved Changes</h2>
			<p class="mb-4 text-sm text-muted-foreground">
				You have unsaved changes. Discard them?
			</p>
			<div class="flex justify-end gap-2">
				<button
					type="button"
					onclick={() => (confirmingClose = false)}
					class="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={forceClose}
					class="inline-flex h-10 items-center justify-center rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
				>
					Discard
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.carta-wrapper :global(.carta-editor) {
		height: 100%;
	}
	.carta-wrapper :global(.carta-wrapper) {
		height: 100%;
		overflow: auto;
	}
	.carta-wrapper :global(.carta-container) {
		height: 100%;
	}
	.carta-wrapper :global(.carta-font-code) {
		font-family: monospace;
		font-size: 0.875rem;
	}
</style>
