<script lang="ts">
	import AccountIdentityForm from '$lib/components/AccountIdentityForm.svelte';
	import type { UsernameAvailabilityState } from '$lib/kainbu/types';

	export let email: string | null = null;
	export let currentUsername: string | null = null;
	export let usernameDraft = '';
	export let availability: UsernameAvailabilityState = 'idle';
	export let feedback = '';
	export let saving = false;
	export let onDraftChange: (value: string) => void;
	export let onSubmit: () => void | Promise<void>;
	export let onSignOut: () => void | Promise<void>;
</script>

<div class="kainbu-overlay absolute inset-0 z-30 flex items-center justify-center p-4">
	<div class="w-full max-w-lg rounded-xl border border-app-border/60 bg-app-surface/95">
		<div class="border-b border-app-border/40 px-5 py-4">
			<p class="text-[10px] font-semibold uppercase tracking-[0.25em] text-app-primary">
				One last step
			</p>
			<h2 class="mt-1.5 text-xl font-bold tracking-tight text-app-text">
				Claim your username
			</h2>
			<p class="mt-1 text-sm text-app-subtext">
				Pick a username to continue into the workspace.
			</p>
		</div>

		<div class="px-5 py-4">
			<AccountIdentityForm
				heading="Account"
				description="Use something short and stable. You can change it later from Settings."
				{email}
				{currentUsername}
				{usernameDraft}
				{availability}
				{feedback}
				{saving}
				submitLabel="Continue"
				showSignOut={true}
				{onDraftChange}
				{onSubmit}
				onSignOut={onSignOut}
			/>
		</div>
	</div>
</div>
