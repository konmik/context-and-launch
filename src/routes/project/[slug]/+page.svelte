<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData, ActionData } from './$types.js';
	import type { TicketInfo } from '$lib/types.js';
	import KanbanBoard from '$lib/components/KanbanBoard.svelte';
	import CreateTicketDialog from '$lib/components/CreateTicketDialog.svelte';
	import EditTicketDialog from '$lib/components/EditTicketDialog.svelte';
	import DeleteTicketDialog from '$lib/components/DeleteTicketDialog.svelte';
	import TicketDetailDialog from '$lib/components/TicketDetailDialog.svelte';
	import AddProjectForm from '$lib/components/AddProjectForm.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let dropdownOpen = $state(false);
	let addProjectDialogOpen = $state(false);
	let createTicketOpen = $state(false);
	let editTicketOpen = $state(false);
	let deleteTicketOpen = $state(false);
	let detailTicketOpen = $state(false);

	let selectedTicket = $state<TicketInfo | null>(null);

	function handleEdit(ticket: TicketInfo) {
		selectedTicket = ticket;
		editTicketOpen = true;
	}

	function handleDelete(ticket: TicketInfo) {
		selectedTicket = ticket;
		deleteTicketOpen = true;
	}

	function handleClick(ticket: TicketInfo) {
		selectedTicket = ticket;
		detailTicketOpen = true;
	}

	async function handleMoveTo(ticket: TicketInfo, status: string) {
		try {
			const res = await fetch(
				`/api/projects/${data.slug}/board/tickets/${ticket.folderName}/status`,
				{
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ status })
				}
			);
			if (res.ok) {
				// Refresh the page data
				goto(`/project/${data.slug}`, { invalidateAll: true });
			}
		} catch {
			// swallow
		}
	}

	function handleAddProjectSuccess(slug: string) {
		addProjectDialogOpen = false;
		goto(`/project/${slug}`);
	}
</script>

<div class="flex min-h-screen flex-col">
	<!-- Header -->
	<header class="flex items-center justify-between border-b border-border px-4 py-3">
		<h1 class="text-xl font-semibold">AI Stages</h1>

		<div class="flex items-center gap-2">
			<div class="relative">
				<button
					class="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 py-1 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
					onclick={() => (dropdownOpen = !dropdownOpen)}
				>
					{data.slug}
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
						class="ml-2"
					>
						<path d="m6 9 6 6 6-6" />
					</svg>
				</button>
				{#if dropdownOpen}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="fixed inset-0 z-40" onclick={() => (dropdownOpen = false)}></div>
					<div
						class="absolute right-0 z-50 mt-1 min-w-[200px] rounded-md border border-border bg-popover py-1 shadow-md"
					>
						{#each data.projects as project}
							{#if project.available}
								<button
									class="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground {project.slug ===
									data.slug
										? 'font-semibold'
										: ''}"
									onclick={() => {
										dropdownOpen = false;
										goto(`/project/${project.slug}`);
									}}
								>
									{project.slug}
								</button>
							{:else}
								<span class="block w-full px-3 py-2 text-sm text-muted-foreground opacity-50">
									{project.slug}
								</span>
							{/if}
						{/each}
						<div class="border-t border-border my-1"></div>
						<button
							class="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
							onclick={() => {
								dropdownOpen = false;
								addProjectDialogOpen = true;
							}}
						>
							Add project...
						</button>
					</div>
				{/if}
			</div>

			<button
				class="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 py-1 text-sm font-medium text-primary-foreground hover:bg-primary/90"
				onclick={() => (createTicketOpen = true)}
			>
				+ New Ticket
			</button>
		</div>
	</header>

	<!-- Content -->
	<main class="flex-1">
		{#if data.projectNotFound}
			<div class="flex h-64 items-center justify-center">
				<p class="text-muted-foreground">Project not found</p>
			</div>
		{:else if data.projectUnavailable}
			<div class="flex h-64 flex-col items-center justify-center gap-2">
				<p class="text-lg font-medium">Project unavailable</p>
				<p class="text-sm text-muted-foreground">{data.projectPath}</p>
			</div>
		{:else if data.error}
			<div class="flex h-64 flex-col items-center justify-center gap-2">
				<p class="text-destructive">{data.error}</p>
				<button
					class="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 py-1 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
					onclick={() => goto(`/project/${data.slug}`, { invalidateAll: true })}
				>
					Retry
				</button>
			</div>
		{:else if data.board}
			<KanbanBoard
				board={data.board}
				slug={data.slug}
				onEdit={handleEdit}
				onDelete={handleDelete}
				onClick={handleClick}
				onMoveTo={handleMoveTo}
			/>
		{/if}
	</main>
</div>

<!-- Dialogs -->
<CreateTicketDialog bind:open={createTicketOpen} slug={data.slug} />
<EditTicketDialog bind:open={editTicketOpen} slug={data.slug} ticket={selectedTicket} />
<DeleteTicketDialog bind:open={deleteTicketOpen} slug={data.slug} ticket={selectedTicket} />
<TicketDetailDialog
	bind:open={detailTicketOpen}
	slug={data.slug}
	ticket={selectedTicket}
	columns={data.board?.columns ?? []}
/>

<!-- Add Project Dialog -->
{#if addProjectDialogOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
		<div class="fixed inset-0" onclick={() => (addProjectDialogOpen = false)}></div>
		<div class="relative z-10 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
			<h2 class="mb-4 text-lg font-semibold">Add Project</h2>
			<AddProjectForm
				action="/project/{data.slug}?/addProject"
				errorMessage={form?.addProjectError ?? ''}
				onSuccess={handleAddProjectSuccess}
			/>
		</div>
	</div>
{/if}
