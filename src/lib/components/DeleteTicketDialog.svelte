<script lang="ts">
	import { enhance } from '$app/forms';
	import type { TicketInfo } from '$lib/types.js';

	let {
		open = $bindable(false),
		slug,
		ticket
	}: {
		open: boolean;
		slug: string;
		ticket: TicketInfo | null;
	} = $props();

	let submitting = $state(false);
	let errorMessage = $state('');

	function close() {
		open = false;
		errorMessage = '';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
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
		<div class="relative z-10 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
			<h2 class="mb-4 text-lg font-semibold">Delete Ticket</h2>
			<p class="mb-4 text-sm text-muted-foreground">
				Delete ticket {ticket.number} - {ticket.title}?
			</p>

			{#if errorMessage}
				<p class="mb-4 text-sm text-destructive">{errorMessage}</p>
			{/if}

			<form
				method="POST"
				action="/project/{slug}?/deleteTicket"
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
				<input type="hidden" name="folderName" value={ticket.folderName} />
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
						disabled={submitting}
						class="inline-flex h-10 items-center justify-center rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:pointer-events-none disabled:opacity-50"
					>
						{submitting ? 'Deleting...' : 'Delete'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
