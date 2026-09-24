<script lang="ts">
	import { onMount } from 'svelte';
	import { FileText, LayoutPanelTop, MessageSquare, ArrowRight } from '$lib/icons';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import { DEFAULT_BOARD_PREFERENCES } from '$lib/kainbu/constants';
	import { board, history, changes, session, pageContent } from './workspaceExample';

	let Board = $state<typeof import('../KanbanBoard.svelte').default>();
	let Chat = $state<typeof import('../ChatPane.svelte').default>();
	let Page = $state<typeof import('../PagePane.svelte').default>();
	let loadError = $state(false);
	let view = $state<'board' | 'page'>('board');
	let chatVisible = $state(true);
	let width = $state(0);
	let viewport: HTMLDivElement;
	const scale = $derived(
		width >= 720 ? Math.min((width - 2) / 1220, 1) : width ? Math.min(0.85, (width - 2) / 360) : 0.85
	);
	const noop = () => {};

	onMount(() => {
		let disposed = false;
		// Real components with isolated example data, loaded off the critical path.
		Promise.all([
			import('../KanbanBoard.svelte'),
			import('../ChatPane.svelte'),
			import('../PagePane.svelte')
		])
			.then(([boardModule, chatModule, pageModule]) => {
				if (disposed) return;
				Board = boardModule.default;
				Chat = chatModule.default;
				Page = pageModule.default;
			})
			.catch(() => {
				if (!disposed) loadError = true;
			});
		return () => {
			disposed = true;
		};
	});

	function toggleChat() {
		chatVisible = !chatVisible;
		if (width < 720)
			requestAnimationFrame(() =>
				viewport?.scrollTo({ left: chatVisible ? viewport.scrollWidth : 0 })
			);
	}
</script>

<div class="preview-toolbar">
	<div class="view-buttons" aria-label="Example workspace view">
		<button
			class:chosen={view === 'board'}
			aria-pressed={view === 'board'}
			onclick={() => {
				view = 'board';
				viewport?.scrollTo({ left: 0 });
			}}><LayoutPanelTop size={15} /> Board</button
		>
		<button
			class:chosen={view === 'page'}
			aria-pressed={view === 'page'}
			onclick={() => {
				view = 'page';
				viewport?.scrollTo({ left: 0 });
			}}><FileText size={15} /> Page</button
		>
	</div>
	<button
		class="chat-toggle"
		class:chosen={chatVisible}
		aria-pressed={chatVisible}
		onclick={toggleChat}
		><MessageSquare size={14} /> {chatVisible ? 'Hide chat' : 'Show chat'}</button
	>
</div>

<figure>
	<!-- Keyboard users need to scroll this illustration horizontally. -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div
		class="preview-viewport"
		bind:clientWidth={width}
		bind:this={viewport}
		tabindex="0"
		role="region"
		aria-label="Scrollable desktop workspace example"
		aria-describedby="example-caption"
	>
		<div class="product" style:zoom={scale} inert aria-hidden="true">
			<div class="workspace-main">
				<div class="workspace-header">
					<div class="project-name"><BrandMark size={28} framed={false} /> Fieldwork journal</div>
					<div class="surface-icons"><LayoutPanelTop size={17} /><FileText size={17} /></div>
				</div>
				<div class="work-surface">
					{#if Board && Page}
						{#if view === 'board'}
							<Board
								data={board}
								boardPreferences={DEFAULT_BOARD_PREFERENCES}
								boardName="Issue 01"
								onChange={noop}
								onSendToChat={noop}
							/>
						{:else}
							<Page title="Editorial direction" content={pageContent} onChange={noop} />
						{/if}
					{:else}
						<p class="loading">
							{loadError
								? 'The preview could not load. Please refresh to try again.'
								: 'Opening the example workspace…'}
						</p>
					{/if}
				</div>
			</div>
			{#if chatVisible}
				<aside class="chat-surface">
					{#if Chat}
						<Chat
							{history}
							sessions={[session]}
							activeSessionId={session.id}
							appliedProposalChanges={changes}
							chrome="sidebar"
							onThinkingLevelChange={noop}
							onDraftChange={noop}
							onSend={noop}
							onAddAttachments={noop}
							onRemoveAttachment={noop}
							onRemoveTaskCard={noop}
							onSessionChange={noop}
							onCreateSession={noop}
							onRenameSession={noop}
							onDeleteSession={noop}
							onModelChange={noop}
							onAcceptProposal={noop}
							onRejectProposal={noop}
							onAnswerQuestion={noop}
							onCollapseSidebar={noop}
						/>
					{/if}
				</aside>
			{/if}
		</div>
	</div>
	<figcaption id="example-caption">
		<span
			>Example workspace · {view === 'board'
				? 'An independent journal, taking shape.'
				: 'The thinking behind the issue.'}</span
		>
		<span class="desktop-caption"
			>{chatVisible ? 'Chat stays beside your work.' : 'Boards and pages, in one project.'}</span
		>
		<span class="mobile-caption">Scroll to explore <ArrowRight size={13} /></span>
		<p class="sr-only">
			A read-only example using Kainbu’s board, page, and chat interface. The Issue 01 board has To
			do, In progress, and Done columns. The assistant has moved two print-ready stories to Done and
			shows an Undo action. Use the controls above to switch the board or page and show or hide the
			chat sidebar.
		</p>
	</figcaption>
</figure>

<style>
	.preview-toolbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 16px;
		gap: 12px;
		font-size: 12px;
	}
	.view-buttons {
		display: flex;
		gap: 6px;
	}
	button {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 40px;
		padding: 9px 14px;
		border: 1px solid transparent;
		border-radius: 2px;
		color: var(--landing-muted);
	}
	button:hover {
		color: var(--landing-ink);
	}
	.view-buttons .chosen {
		border-color: var(--landing-ink);
		color: var(--landing-ink);
	}
	.chat-toggle.chosen {
		color: var(--landing-accent);
	}
	.preview-viewport {
		overflow: auto;
		width: 100%;
		background: #0e0f11;
		border: 1px solid #35362f;
		border-radius: 5px;
		scrollbar-color: #646557 #0e0f11;
	}
	.product {
		width: 1220px;
		height: 590px;
		display: flex;
		text-align: left;
		color: #f4f4f5;
		color-scheme: dark;
		--color-app-bg: #0e0f11;
		--color-app-surface: #18181b;
		--color-app-column: #131316;
		--color-app-surface-hover: #27272a;
		--color-app-element: #232326;
		--color-app-border: #2f2f33;
		--color-app-text: #f4f4f5;
		--color-app-subtext: #a1a1aa;
		--color-app-primary: #a1a1aa;
		--color-app-primary-hover: #71717a;
		--color-app-accent: #a1a1aa;
		--color-app-accent-hover: #71717a;
	}
	.workspace-main {
		min-width: 0;
		flex: 1;
		display: flex;
		flex-direction: column;
	}
	.workspace-header {
		height: 54px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 16px;
		border-bottom: 1px solid #2f2f3380;
	}
	.project-name {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		font-weight: 500;
	}
	.surface-icons {
		display: flex;
		gap: 22px;
		color: #a1a1aa;
	}
	.work-surface {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}
	.chat-surface {
		width: 360px;
		flex-shrink: 0;
		position: relative;
		border-left: 1px solid #2f2f3380;
	}
	.loading {
		padding: 32px;
		font-size: 14px;
		color: #a1a1aa;
	}
	figcaption {
		display: flex;
		justify-content: space-between;
		gap: 20px;
		margin-top: 16px;
		font-size: 11px;
		line-height: 1.7;
		color: var(--landing-muted);
	}
	.mobile-caption {
		display: none;
	}
	@media (max-width: 719px) {
		.desktop-caption {
			display: none;
		}
		.mobile-caption {
			display: flex;
			align-items: center;
			gap: 6px;
			white-space: nowrap;
		}
		figcaption {
			font-size: 10px;
			gap: 10px;
		}
		button {
			padding: 9px 10px;
		}
	}
</style>
