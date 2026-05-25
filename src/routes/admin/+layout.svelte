<script lang="ts">
	import AdminSidebar from '$lib/components/admin/AdminSidebar.svelte';

	let { data, children } = $props();
</script>

<div class="flex h-dvh bg-app-bg text-app-text">
	<AdminSidebar email={data.email || ''} />
	<main class="min-h-0 min-w-0 flex-1 overflow-y-auto">
		{@render children()}
	</main>
</div>
