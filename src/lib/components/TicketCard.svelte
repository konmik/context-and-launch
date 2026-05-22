<script lang="ts">
	import type { TicketInfo } from '$lib/types.js';

	let {
		ticket,
		columns = [],
		onEdit,
		onDelete,
		onClick,
		onMoveTo
	}: {
		ticket: TicketInfo;
		columns: string[];
		onEdit: (ticket: TicketInfo) => void;
		onDelete: (ticket: TicketInfo) => void;
		onClick: (ticket: TicketInfo) => void;
		onMoveTo: (ticket: TicketInfo, status: string) => void;
	} = $props();

	let menuOpen = $state(false);
	let moveMenuOpen = $state(false);

	const stageColors = [
		'bg-blue-100 text-blue-800',
		'bg-green-100 text-green-800',
		'bg-yellow-100 text-yellow-800',
		'bg-purple-100 text-purple-800',
		'bg-pink-100 text-pink-800'
	];

	function getStageColor(index: number): string {
		return stageColors[index % stageColors.length];
	}

	function handleCardClick(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (target.closest('[data-menu]')) return;
		onClick(ticket);
	}

	function handleMenuClick(e: MouseEvent) {
		e.stopPropagation();
		menuOpen = !menuOpen;
		moveMenuOpen = false;
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="cursor-pointer rounded-md border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md"
	onclick={handleCardClick}
>
	<div class="mb-1 flex items-start justify-between">
		<span class="text-sm font-medium text-primary">{ticket.number}</span>
		<div class="relative" data-menu>
			<button
				class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
				onclick={handleMenuClick}
				aria-label="Ticket actions"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<circle cx="12" cy="12" r="1" />
					<circle cx="12" cy="5" r="1" />
					<circle cx="12" cy="19" r="1" />
				</svg>
			</button>
			{#if menuOpen}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="fixed inset-0 z-40" onclick={() => { menuOpen = false; moveMenuOpen = false; }}></div>
				<div
					class="absolute right-0 z-50 min-w-[150px] rounded-md border border-border bg-popover py-1 shadow-md"
				>
					<div class="relative">
						<button
							class="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
							onclick={(e) => {
								e.stopPropagation();
								moveMenuOpen = !moveMenuOpen;
							}}
						>
							Move to...
						</button>
						{#if moveMenuOpen}
							<div
								class="absolute left-full top-0 min-w-[120px] rounded-md border border-border bg-popover py-1 shadow-md"
							>
								{#each columns.filter((c) => c !== ticket.status) as col}
									<button
										class="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
										onclick={(e) => {
											e.stopPropagation();
											menuOpen = false;
											moveMenuOpen = false;
											onMoveTo(ticket, col);
										}}
									>
										{col}
									</button>
								{/each}
							</div>
						{/if}
					</div>
					<button
						class="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
						onclick={(e) => {
							e.stopPropagation();
							menuOpen = false;
							onEdit(ticket);
						}}
					>
						Edit
					</button>
					<button
						class="w-full px-3 py-2 text-left text-sm text-destructive hover:bg-accent"
						onclick={(e) => {
							e.stopPropagation();
							menuOpen = false;
							onDelete(ticket);
						}}
					>
						Delete
					</button>
				</div>
			{/if}
		</div>
	</div>
	<p class="line-clamp-2 text-sm">{ticket.title}</p>
	{#if ticket.stageNames.length > 0}
		<div class="mt-2 flex flex-wrap gap-1">
			{#each ticket.stageNames as stage, i}
				<span class="rounded-full px-2 py-0.5 text-xs {getStageColor(i)}">
					{stage}
				</span>
			{/each}
		</div>
	{/if}
</div>
