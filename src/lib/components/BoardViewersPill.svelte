<script lang="ts">
	import { Users } from '$lib/icons';
	import { getProjectMemberDisplayName } from '$lib/kainbu/members';
	import type { ProjectMembership } from '$lib/kainbu/types';

	export let viewers: ProjectMembership[] = [];

	let open = false;

	const toggle = () => {
		open = !open;
	};

	const close = () => {
		open = false;
	};
</script>

{#if viewers.length > 0}
	<div class="relative">
		<button
			type="button"
			class="inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-app-border bg-app-surface px-2.5 text-[11px] font-semibold leading-none text-app-subtext transition hover:border-app-primary/30 hover:text-app-text"
			title="Who is viewing this board"
			aria-expanded={open}
			onclick={toggle}
		>
			<Users size={13} />
			{viewers.length} on board
		</button>

		{#if open}
			<button
				type="button"
				class="fixed inset-0 z-[120] cursor-default"
				aria-label="Close viewers list"
				onclick={close}
			></button>
			<div
				class="absolute left-0 top-full z-[130] mt-1 min-w-[10rem] rounded-lg border border-app-border bg-app-surface p-2 shadow-lg"
				role="menu"
			>
				<p class="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-app-subtext">
					Viewing now
				</p>
				<ul class="space-y-0.5">
					{#each viewers as viewer (viewer.userId)}
						<li class="rounded-md px-2 py-1 text-[11px] text-app-text">
							{getProjectMemberDisplayName(viewer)}
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	</div>
{/if}
