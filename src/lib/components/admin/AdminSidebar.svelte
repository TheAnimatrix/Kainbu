<script lang="ts">
	import { page } from '$app/stores';

	export let email = '';

	const links = [
		{ href: '/admin', label: 'Overview', exact: true },
		{ href: '/admin/ai', label: 'AI key' },
		{ href: '/admin/usage', label: 'Usage' },
		{ href: '/admin/users', label: 'Users' }
	];

	const isActive = (href: string, exact = false) => {
		const path = $page.url.pathname;
		if (exact) return path === href;
		return path === href || path.startsWith(`${href}/`);
	};
</script>

<aside
	class="flex h-full w-48 shrink-0 flex-col border-r border-app-border/40 bg-app-bg px-2 py-3 lg:w-52"
>
	<div class="px-2 pb-3">
		<p class="text-[10px] font-semibold uppercase tracking-[0.25em] text-app-primary">Admin</p>
		{#if email}
			<p class="mt-1 truncate text-xs text-app-subtext">{email}</p>
		{/if}
	</div>

	<nav class="flex flex-1 flex-col gap-0.5">
		{#each links as link}
			<a
				href={link.href}
				class="rounded-md px-3 py-1.5 text-sm transition-colors {isActive(link.href, link.exact)
					? 'bg-app-element text-app-text'
					: 'text-app-subtext hover:bg-app-element/60 hover:text-app-text'}"
			>
				{link.label}
			</a>
		{/each}
	</nav>

	<div class="mt-auto border-t border-app-border/30 px-2 pt-3">
		<a
			href="/"
			class="text-xs text-app-subtext transition-colors hover:text-app-text"
		>
			← Workspace
		</a>
	</div>
</aside>
