<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';

	let {
		action = '',
		errorMessage = '',
		onSuccess
	}: {
		action?: string;
		errorMessage?: string;
		onSuccess?: (slug: string) => void;
	} = $props();

	let pathValue = $state('');
	let submitting = $state(false);
	let localError = $state('');

	const canBrowse =
		typeof globalThis.window !== 'undefined' && 'showDirectoryPicker' in globalThis.window;

	function handleBrowse() {
		if (canBrowse) {
			(globalThis.window as any)
				.showDirectoryPicker()
				.then((handle: any) => {
					pathValue = handle.name;
				})
				.catch(() => {});
		}
	}

	$effect(() => {
		localError = errorMessage;
	});
</script>

<form
	method="POST"
	action={action || undefined}
	use:enhance={() => {
		submitting = true;
		localError = '';
		return async ({ result, update }) => {
			submitting = false;
			if (result.type === 'redirect') {
				await update();
			} else if (result.type === 'failure') {
				const data = result.data as Record<string, any>;
				localError = data?.error || data?.addProjectError || 'Unknown error';
			} else if (result.type === 'success') {
				const data = result.data as Record<string, any>;
				if (data?.addProjectSuccess && data?.newSlug) {
					onSuccess?.(data.newSlug);
				}
				await update();
			}
		};
	}}
>
	<div class="mb-4">
		<label for="project-path" class="mb-2 block text-sm font-medium"> Git Repository Path </label>
		<div class="flex gap-2">
			<input
				id="project-path"
				name="path"
				type="text"
				bind:value={pathValue}
				placeholder="/path/to/your/repo"
				class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
			/>
			{#if canBrowse}
				<button
					type="button"
					onclick={handleBrowse}
					class="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
				>
					Browse
				</button>
			{/if}
		</div>
	</div>

	{#if localError}
		<p class="mb-4 text-sm text-destructive">{localError}</p>
	{/if}

	<button
		type="submit"
		disabled={submitting || !pathValue.trim()}
		class="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
	>
		{submitting ? 'Adding...' : 'Add Project'}
	</button>
</form>
