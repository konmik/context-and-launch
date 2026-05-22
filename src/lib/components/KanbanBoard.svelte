<script lang="ts">
	import { draggable, droppable } from '@thisux/sveltednd';
	import type { TicketInfo, BoardState } from '$lib/types.js';
	import TicketCard from './TicketCard.svelte';

	let {
		board,
		slug,
		onEdit,
		onDelete,
		onClick,
		onMoveTo
	}: {
		board: BoardState;
		slug: string;
		onEdit: (ticket: TicketInfo) => void;
		onDelete: (ticket: TicketInfo) => void;
		onClick: (ticket: TicketInfo) => void;
		onMoveTo: (ticket: TicketInfo, status: string) => void;
	} = $props();

	function ticketsForColumn(column: string): TicketInfo[] {
		return board.tickets
			.filter((t) => t.status === column)
			.sort((a, b) => a.number.toLowerCase().localeCompare(b.number.toLowerCase()));
	}

	async function handleDrop(state: any) {
		const ticket = state.draggedItem as TicketInfo;
		const targetContainer = state.targetContainer as string;
		if (!ticket || !targetContainer || ticket.status === targetContainer) return;
		onMoveTo(ticket, targetContainer);
	}
</script>

<div class="flex gap-4 overflow-x-auto p-4" style="min-height: calc(100vh - 80px);">
	{#each board.columns as column}
		<div
			class="flex min-w-[250px] flex-1 flex-col rounded-lg bg-muted/50 p-3"
			use:droppable={{
				container: column,
				callbacks: { onDrop: handleDrop }
			}}
		>
			<h3 class="mb-3 text-sm font-semibold uppercase text-muted-foreground">{column}</h3>
			<div class="flex flex-col gap-2">
				{#each ticketsForColumn(column) as ticket (ticket.folderName)}
					<div
						use:draggable={{
							dragData: ticket,
							container: column
						}}
					>
						<TicketCard
							{ticket}
							columns={board.columns}
							{onEdit}
							{onDelete}
							{onClick}
							{onMoveTo}
						/>
					</div>
				{/each}
			</div>
		</div>
	{/each}
</div>
