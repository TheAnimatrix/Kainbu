<script lang="ts">
	import AdminSidebar from '$lib/components/admin/AdminSidebar.svelte';

	export let data: { email?: string };
</script>

<div class="flex min-h-screen bg-app-bg text-app-text">
	<AdminSidebar email={data.email || ''} />
	<main class="min-w-0 flex-1 overflow-hidden">
		<slot />
	</main>
</div>
