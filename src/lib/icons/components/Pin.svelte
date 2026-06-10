<script lang="ts">
	import BaseIcon from '$lib/components/FluentIcon.svelte';
	import type { FluentIconProps } from '$lib/icons/types';

	let props: FluentIconProps = $props();
</script>

<BaseIcon name="Pin" {...props} />
