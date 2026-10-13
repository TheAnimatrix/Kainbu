<script lang="ts">
	import WorkspaceShell from '$lib/components/WorkspaceShell.svelte';

	let { children } = $props();
</script>

<!--
	Every workspace URL (/, /dashboard, /settings/*, /projects/*) shares this layout, so the
	shell stays mounted across navigation between them. The shell reads the URL itself;
	child pages are intentionally empty.
-->
<WorkspaceShell />
{@render children()}
