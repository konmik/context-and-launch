<script lang="ts">
	import { enhance } from '$app/forms';

	let {
		open = $bindable(false),
		slug
	}: {
		open: boolean;
		slug: string;
	} = $props();

	let number = $state('');
	let title = $state('');
	let submitting = $state(false);
	let errorMessage = $state('');

	function close() {
		open = false;
		number = '';
		title = '';
		errorMessage = '';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
		onkeydown={handleKeydown}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="fixed inset-0" onclick={close}></div>
		<div class="relative z-10 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
			<h2 class="mb-4 text-lg font-semibold">New Ticket</h2>
			<form
				method="POST"
				action="/project/{slug}?/createTicket"
				use:enhance={() => {
					submitting = true;
					errorMessage = '';
					return async ({ result, update }) => {
						submitting = false;
						if (result.type === 'failure') {
							const data = result.data as Record<string, any>;
							errorMessage = data?.ticketError || 'Unknown error';
						} else {
							close();
							await update();
						}
					};
				}}
			>
				<div class="mb-4">
					<label for="ticket-number" class="mb-2 block text-sm font-medium">Number</label>
					<input
						id="ticket-number"
						name="number"
						type="text"
						bind:value={number}
						class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						placeholder="e.g. ABC-1"
					/>
				</div>
				<div class="mb-4">
					<label for="ticket-title" class="mb-2 block text-sm font-medium">Title</label>
					<input
						id="ticket-title"
						name="title"
						type="text"
						bind:value={title}
						class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						placeholder="e.g. Fix login timeout"
					/>
				</div>

				{#if errorMessage}
					<p class="mb-4 text-sm text-destructive">{errorMessage}</p>
				{/if}

				<div class="flex justify-end gap-2">
					<button
						type="button"
						onclick={close}
						class="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={submitting || !number.trim() || !title.trim()}
						class="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
					>
						{submitting ? 'Creating...' : 'Create'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
