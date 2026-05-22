<script lang="ts">
	import AddProjectForm from '$lib/components/AddProjectForm.svelte';
	import type { ActionData } from './$types.js';

	let { form }: { form: ActionData } = $props();
</script>

<div class="flex min-h-screen items-center justify-center p-4">
	<div class="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
		<h1 class="mb-6 text-2xl font-semibold">Welcome to AI Stages</h1>
		<AddProjectForm errorMessage={form?.error ?? ''} />
	</div>
</div>
