<script lang="ts">
	import { onDestroy } from 'svelte';
	import {
		Check,
		CheckSquare,
		ChevronDown,
		Clock3,
		Copy,
		Download,
		Expand,
		FileText,
		LoaderCircle,
		Lock,
		MessageSquare,
		PanelRightOpen,
		Paperclip,
		RectangleHorizontal,
		Square,
		Tag as TagIcon,
		Trash2,
		Upload,
		X
	} from 'lucide-svelte';
	import MarkdownBlockEditor from '$lib/components/MarkdownBlockEditor.svelte';
	import { SURFACE_TONE_OPTIONS, TAG_COLORS } from '$lib/kainbu/constants';
	import { createId } from '$lib/kainbu/id';
	import {
		getProjectMemberDisplayName,
		getProjectMemberSearchText
	} from '$lib/kainbu/members';
	import {
		addTaskComment,
		deleteTaskAsset,
		downloadTaskAssetBlob,
		fetchTaskDetails,
		uploadTaskAsset
	} from '$lib/kainbu/taskDetails';
	import {
		replaceAssetEmbedsForClipboard,
		stripAssetEmbeds,
		toggleMarkdownCheckbox,
		type TaskReferenceOption
	} from '$lib/kainbu/taskMarkdown';
	import { clearTaskDueAt, getTaskDueAt, setTaskDueAt } from '$lib/kainbu/timing';
	import { getModalToneStyle, getTagToneClasses } from '$lib/kainbu/tags';
	import type {
		ChatAttachment,
		Column,
		ProjectMembership,
		Tag,
		Task,
		TaskAsset,
		TaskAssetKind,
		TaskComment
	} from '$lib/kainbu/types';

	export let task: Task;
	export let projectId = '';
	export let columns: Column[] = [];
	export let members: ProjectMembership[] = [];
	export let columnTitle = '';
	export let existingTags: Tag[] = [];
	export let onClose: () => void;
	export let onSave: (
		nextTask: Task,
		options?: { recordHistory?: boolean; syncDelay?: number }
	) => void | Promise<void>;
	export let onTaskReferenceNavigate:
		| ((payload: { taskId: string; columnId: string }) => void)
		| undefined = undefined;
	export let onAddAttachments: ((attachments: ChatAttachment[]) => void) | undefined = undefined;
	export let desktopLayoutMode: DesktopLayoutMode = 'modal';
	export let onDesktopLayoutModeChange: (mode: DesktopLayoutMode) => void = () => {};
	export let presentation: 'overlay' | 'pane' = 'overlay';

	type DesktopLayoutMode = 'modal' | 'dock' | 'fullscreen';
	type SaveState = 'saved' | 'dirty' | 'saving' | 'error';
	type PendingUpload = {
		tempId: string;
		name: string;
		mimeType: string;
		kind: TaskAssetKind;
	};

	const AUTOSAVE_DELAY_MS = 520;
	const LAYOUT_OPTIONS: { mode: DesktopLayoutMode; label: string }[] = [
		{ mode: 'modal', label: 'Centered modal' },
		{ mode: 'dock', label: 'Right dock' },
		{ mode: 'fullscreen', label: 'Full pane' }
	];

	let draft: Task = structuredClone(task);
	let activeTaskId = task.id;
	let externalTaskFingerprint = '';
	let lastFlushedFingerprint = '';
	let viewportWidth = 0;
	let tagSearch = '';
	let tonePickerOpen = false;
	let tagColorPickerOpen = false;
	let layoutPickerOpen = false;
	let selectedTagColor: string = TAG_COLORS[0]?.value ?? '';
	let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
	let saveState: SaveState = 'saved';
	let saveMessage = 'All changes saved';
	let saveInFlight = false;
	let queuedFlush = false;
	let historyCheckpointRecorded = false;
	let attachmentInput: HTMLInputElement | null = null;
	let detailsLoading = false;
	let detailsErrorMessage = '';
	let taskAssets: TaskAsset[] = [];
	let taskComments: TaskComment[] = [];
	let pendingUploads: PendingUpload[] = [];
	let assetUrls: Record<string, string> = {};
	let objectUrls = new Map<string, string>();
	let loadingAssetIds = new Set<string>();
	let commentDraft = '';
	let commentSubmitting = false;
	let commentErrorMessage = '';
	let descriptionActionMessage = '';
	let descriptionActionTimer: ReturnType<typeof setTimeout> | null = null;
	let latestDetailsKey = '';

	const autoGrowTitle = (node: HTMLTextAreaElement) => {
		const resize = () => {
			node.style.height = '0px';
			node.style.height = `${node.scrollHeight}px`;
		};

		queueMicrotask(resize);
		node.addEventListener('input', resize);

		return {
			update: resize,
			destroy() {
				node.removeEventListener('input', resize);
			}
		};
	};

	const normalizeDraftTask = (candidate: Task): Task => ({
		...candidate,
		title: candidate.title.trim(),
		description: candidate.description || '',
		color: candidate.color || undefined,
		tags: [...(candidate.tags || [])]
	});

	const getTaskFingerprint = (candidate: Task) =>
		JSON.stringify({
			title: candidate.title.trim(),
			description: candidate.description || '',
			color: candidate.color || '',
			tags: [...(candidate.tags || [])].map((tag) => `${tag.id}:${tag.label}:${tag.color}`).sort(),
			hasCheckbox: Boolean(candidate.hasCheckbox),
			checked: Boolean(candidate.checked),
			completedAt: candidate.completedAt ?? null,
			countdownAt: candidate.countdownAt ?? null,
			alarmAt: candidate.alarmAt ?? null,
			assignedTo: candidate.assignedTo || ''
		});

	const refreshSaveBadge = (state: SaveState, message?: string) => {
		saveState = state;
		saveMessage =
			message ||
			(state === 'saved'
				? 'All changes saved'
				: state === 'saving'
					? 'Autosaving…'
					: state === 'dirty'
						? 'Unsaved changes'
						: 'Unable to save');
	};

	const clearAutosaveTimer = () => {
		if (!autosaveTimer) return;
		clearTimeout(autosaveTimer);
		autosaveTimer = null;
	};

	const setDescriptionActionMessage = (message: string) => {
		descriptionActionMessage = message;
		if (descriptionActionTimer) clearTimeout(descriptionActionTimer);
		descriptionActionTimer = setTimeout(() => {
			descriptionActionMessage = '';
			descriptionActionTimer = null;
		}, 2200);
	};

	const syncDraftFromTask = (nextTask: Task) => {
		draft = structuredClone(nextTask);
		activeTaskId = nextTask.id;
		externalTaskFingerprint = getTaskFingerprint(nextTask);
		lastFlushedFingerprint = externalTaskFingerprint;
		historyCheckpointRecorded = false;
		refreshSaveBadge('saved');
	};

	const setObjectUrl = (key: string, url: string) => {
		const previousUrl = objectUrls.get(key);
		if (previousUrl && previousUrl !== url) URL.revokeObjectURL(previousUrl);
		objectUrls.set(key, url);
		assetUrls = { ...assetUrls, [key]: url };
	};

	const dropObjectUrl = (key: string, revoke = true) => {
		const previousUrl = objectUrls.get(key);
		if (previousUrl && revoke) URL.revokeObjectURL(previousUrl);
		objectUrls.delete(key);
		const { [key]: _discarded, ...remaining } = assetUrls;
		assetUrls = remaining;
	};

	const promoteObjectUrl = (fromKey: string, toKey: string) => {
		const url = objectUrls.get(fromKey);
		if (!url) return;
		objectUrls.delete(fromKey);
		objectUrls.set(toKey, url);
		const nextUrls = { ...assetUrls };
		delete nextUrls[fromKey];
		nextUrls[toKey] = url;
		assetUrls = nextUrls;
	};

	const revokeAllObjectUrls = () => {
		for (const url of objectUrls.values()) {
			URL.revokeObjectURL(url);
		}
		objectUrls.clear();
		assetUrls = {};
	};

	const isImageMimeType = (mimeType: string) => mimeType.startsWith('image/');

	const blobToDataUrl = (blob: Blob) =>
		new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onerror = () => reject(reader.error);
			reader.onload = () => resolve(reader.result as string);
			reader.readAsDataURL(blob);
		});

	const ensureAssetPreview = async (asset: TaskAsset) => {
		if (!isImageMimeType(asset.mimeType) || assetUrls[asset.id] || loadingAssetIds.has(asset.id)) {
			return;
		}

		loadingAssetIds.add(asset.id);
		try {
			const blob = await downloadTaskAssetBlob(asset.storagePath);
			setObjectUrl(asset.id, URL.createObjectURL(blob));
		} catch (error) {
			console.error(error);
			detailsErrorMessage =
				error instanceof Error ? error.message : 'Unable to load one or more attachment previews.';
		} finally {
			loadingAssetIds.delete(asset.id);
		}
	};

	const pruneStaleAssetUrls = () => {
		const validKeys = new Set<string>();
		for (const asset of taskAssets) {
			if (isImageMimeType(asset.mimeType)) validKeys.add(asset.id);
		}
		for (const pendingUpload of pendingUploads) {
			if (isImageMimeType(pendingUpload.mimeType)) validKeys.add(`pending:${pendingUpload.tempId}`);
		}
		for (const key of [...objectUrls.keys()]) {
			if (!validKeys.has(key)) dropObjectUrl(key);
		}
	};

	const getMemberLabel = (userId: string) => {
		const member = members.find((entry) => entry.userId === userId);
		if (!member) return userId.slice(0, 8);
		return getProjectMemberDisplayName(member);
	};

	const hydrateTaskDetails = async (requestedKey: string) => {
		if (!projectId || !task.id) return;
		detailsLoading = true;
		detailsErrorMessage = '';
		try {
			const details = await fetchTaskDetails(projectId, task.id);
			if (latestDetailsKey !== requestedKey) return;
			taskAssets = details.assets;
			taskComments = details.comments;
			pruneStaleAssetUrls();
			for (const asset of details.assets) void ensureAssetPreview(asset);
		} catch (error) {
			if (latestDetailsKey !== requestedKey) return;
			detailsErrorMessage =
				error instanceof Error ? error.message : 'Unable to load attachments and comments.';
		} finally {
			if (latestDetailsKey === requestedKey) detailsLoading = false;
		}
	};

	const scheduleAutosave = () => {
		clearAutosaveTimer();
		refreshSaveBadge('dirty');
		autosaveTimer = setTimeout(() => {
			autosaveTimer = null;
			void flushDraft();
		}, AUTOSAVE_DELAY_MS);
	};

	const flushDraft = async (force = false) => {
		clearAutosaveTimer();
		const normalizedDraft = normalizeDraftTask(draft);
		const nextFingerprint = getTaskFingerprint(normalizedDraft);
		if (!normalizedDraft.title.length) {
			refreshSaveBadge('error', 'Task title is required');
			return false;
		}
		if (!force && nextFingerprint === lastFlushedFingerprint) {
			refreshSaveBadge('saved');
			return true;
		}
		if (saveInFlight) {
			queuedFlush = true;
			return false;
		}
		saveInFlight = true;
		refreshSaveBadge('saving');
		try {
			await onSave(normalizedDraft, {
				recordHistory: !historyCheckpointRecorded,
				syncDelay: AUTOSAVE_DELAY_MS
			});
			historyCheckpointRecorded = true;
			lastFlushedFingerprint = nextFingerprint;
			externalTaskFingerprint = nextFingerprint;
			refreshSaveBadge(
				getTaskFingerprint(draft) === nextFingerprint ? 'saved' : 'dirty',
				getTaskFingerprint(draft) === nextFingerprint ? 'All changes saved' : 'Unsaved changes'
			);
			return true;
		} catch (error) {
			refreshSaveBadge(
				'error',
				error instanceof Error ? error.message : 'Unable to save your task changes.'
			);
			return false;
		} finally {
			saveInFlight = false;
			if (queuedFlush || getTaskFingerprint(draft) !== lastFlushedFingerprint) {
				queuedFlush = false;
				void flushDraft(true);
			}
		}
	};

	const mutateDraft = (
		mutator: (current: Task) => Task,
		saveMode: 'debounced' | 'immediate' = 'debounced'
	) => {
		draft = mutator(draft);
		if (saveMode === 'immediate') {
			void flushDraft(true);
			return;
		}
		scheduleAutosave();
	};

	const toggleComplete = () => {
		mutateDraft((current) => {
			const checked = !current.checked;
			return {
				...current,
				checked,
				completedAt: checked ? Date.now() : undefined
			};
		}, 'immediate');
	};

	const addTag = (label: string, color: string) => {
		const clean = label.trim();
		if (!clean || draft.tags.some((tag) => tag.label.toLowerCase() === clean.toLowerCase())) return;
		mutateDraft(
			(current) => ({
				...current,
				tags: [...current.tags, { id: createId(), label: clean, color }]
			}),
			'immediate'
		);
		tagSearch = '';
	};

	const deleteTag = (tagId: string) => {
		mutateDraft(
			(current) => ({
				...current,
				tags: current.tags.filter((tag) => tag.id !== tagId)
			}),
			'immediate'
		);
	};

	const toggleDescriptionCheckbox = (index: number, checked: boolean) => {
		if (!draft.description) return;
		mutateDraft(
			(current) => ({
				...current,
				description: toggleMarkdownCheckbox(current.description || '', index, checked)
			}),
			'immediate'
		);
	};

	const setTaskColor = (color: string) => {
		mutateDraft(
			(current) => ({
				...current,
				color: color || undefined
			}),
			'immediate'
		);
	};

	const toLocalInputValue = (timestamp?: number) => {
		if (!timestamp) return '';
		const date = new Date(timestamp);
		const normalized = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
		return normalized.toISOString().slice(0, 16);
	};

	const fromLocalInputValue = (value: string) => {
		if (!value.trim()) return undefined;
		const parsed = new Date(value).getTime();
		return Number.isFinite(parsed) ? parsed : undefined;
	};

	const handleEmbedUpload = async (
		requests: Array<{ tempId: string; file: File; source: 'paste' | 'command' }>
	) => {
		const pendingEntries: PendingUpload[] = requests.map((request) => ({
			tempId: request.tempId,
			name: request.file.name || 'Image',
			mimeType: request.file.type || 'image/png',
			kind: 'embed'
		}));
		pendingUploads = [...pendingEntries, ...pendingUploads];
		for (const request of requests) {
			if (request.file.type.startsWith('image/')) {
				setObjectUrl(`pending:${request.tempId}`, URL.createObjectURL(request.file));
			}
		}

		const results = await Promise.all(
			requests.map(async (request) => {
				try {
					const asset = await uploadTaskAsset(projectId, task.id, request.file, 'embed');
					taskAssets = [asset, ...taskAssets.filter((entry) => entry.id !== asset.id)];
					if (assetUrls[`pending:${request.tempId}`]) {
						promoteObjectUrl(`pending:${request.tempId}`, asset.id);
					} else {
						void ensureAssetPreview(asset);
					}
					return { tempId: request.tempId, assetId: asset.id };
				} catch (error) {
					detailsErrorMessage =
						error instanceof Error ? error.message : 'Unable to upload embedded image.';
					dropObjectUrl(`pending:${request.tempId}`);
					return {
						tempId: request.tempId,
						error: error instanceof Error ? error.message : 'Unable to upload embedded image.'
					};
				} finally {
					pendingUploads = pendingUploads.filter((entry) => entry.tempId !== request.tempId);
				}
			})
		);

		pruneStaleAssetUrls();
		return results;
	};

	const handleAttachmentFiles = async (files: File[]) => {
		const requests = files
			.filter((file) => file.size > 0)
			.map((file) => ({ tempId: createId(), file }));
		if (!requests.length) return;

		const pendingEntries: PendingUpload[] = requests.map((request) => ({
			tempId: request.tempId,
			name: request.file.name || 'File',
			mimeType: request.file.type || 'application/octet-stream',
			kind: 'attachment'
		}));
		pendingUploads = [...pendingEntries, ...pendingUploads];

		for (const request of requests) {
			if (request.file.type.startsWith('image/')) {
				setObjectUrl(`pending:${request.tempId}`, URL.createObjectURL(request.file));
			}
		}

		await Promise.all(
			requests.map(async (request) => {
				try {
					const asset = await uploadTaskAsset(projectId, task.id, request.file, 'attachment');
					taskAssets = [asset, ...taskAssets.filter((entry) => entry.id !== asset.id)];
					if (assetUrls[`pending:${request.tempId}`]) {
						promoteObjectUrl(`pending:${request.tempId}`, asset.id);
					} else {
						void ensureAssetPreview(asset);
					}
				} catch (error) {
					detailsErrorMessage =
						error instanceof Error ? error.message : 'Unable to upload attachment.';
					dropObjectUrl(`pending:${request.tempId}`);
				} finally {
					pendingUploads = pendingUploads.filter((entry) => entry.tempId !== request.tempId);
				}
			})
		);

		pruneStaleAssetUrls();
	};

	const handleDeleteAsset = async (asset: TaskAsset) => {
		const nextDescription = stripAssetEmbeds(draft.description || '', asset.id);
		if (nextDescription !== (draft.description || '')) {
			draft = { ...draft, description: nextDescription };
			await flushDraft(true);
		}

		try {
			await deleteTaskAsset(asset);
			taskAssets = taskAssets.filter((entry) => entry.id !== asset.id);
			dropObjectUrl(asset.id);
		} catch (error) {
			detailsErrorMessage = error instanceof Error ? error.message : 'Unable to delete attachment.';
		}
	};

	const handleDownloadAsset = async (asset: TaskAsset) => {
		try {
			const blob = await downloadTaskAssetBlob(asset.storagePath);
			const objectUrl = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = objectUrl;
			link.download = asset.name;
			link.click();
			URL.revokeObjectURL(objectUrl);
		} catch (error) {
			detailsErrorMessage =
				error instanceof Error ? error.message : 'Unable to download attachment.';
		}
	};

	const handleEmbeddedImageDelete = async (assetId: string) => {
		const asset = taskAssets.find((entry) => entry.id === assetId);
		if (asset) {
			await handleDeleteAsset(asset);
			setDescriptionActionMessage('Embedded image removed.');
			return;
		}

		const nextDescription = stripAssetEmbeds(draft.description || '', assetId);
		if (nextDescription === (draft.description || '')) return;
		mutateDraft(
			(current) => ({
				...current,
				description: nextDescription
			}),
			'immediate'
		);
		setDescriptionActionMessage('Embedded image removed.');
	};

	const handleEmbeddedImageAddToChat = async (assetId: string) => {
		if (!onAddAttachments) return;
		const asset = taskAssets.find((entry) => entry.id === assetId);
		if (!asset) {
			throw new Error('Image is still loading. Try again in a moment.');
		}

		const blob = await downloadTaskAssetBlob(asset.storagePath);
		const mimeType = asset.mimeType || blob.type || 'image/png';
		const content = await blobToDataUrl(blob);
		onAddAttachments([
			{
				id: createId(),
				kind: 'image',
				name: asset.name,
				mimeType,
				content
			}
		]);
		setDescriptionActionMessage('Image added to chat.');
	};

	const handleCopyDescriptionMarkdown = async () => {
		const markdown = replaceAssetEmbedsForClipboard(draft.description || '');
		try {
			await navigator.clipboard.writeText(markdown);
			setDescriptionActionMessage('Markdown copied.');
		} catch (error) {
			setDescriptionActionMessage(
				error instanceof Error ? error.message : 'Unable to copy markdown.'
			);
		}
	};

	const handleAddComment = async () => {
		const trimmed = commentDraft.trim();
		if (!trimmed.length || commentSubmitting) return;
		commentSubmitting = true;
		commentErrorMessage = '';
		try {
			const nextComment = await addTaskComment(projectId, task.id, trimmed);
			taskComments = [...taskComments, nextComment];
			commentDraft = '';
		} catch (error) {
			commentErrorMessage =
				error instanceof Error ? error.message : 'Unable to post comment right now.';
		} finally {
			commentSubmitting = false;
		}
	};

	const requestClose = async () => {
		const saved = await flushDraft(true);
		if (saved || getTaskFingerprint(draft) === lastFlushedFingerprint) onClose();
	};

	const handleReferenceNavigate = async (reference: TaskReferenceOption) => {
		if (reference.kind !== 'task' || !onTaskReferenceNavigate) return;
		const resolvedColumnId =
			reference.columnId ||
			columns.find((column) => column.tasks.some((entry) => entry.id === reference.id))?.id;
		if (!resolvedColumnId) return;
		const saved = await flushDraft(true);
		if (!saved && getTaskFingerprint(draft) !== lastFlushedFingerprint) return;
		onTaskReferenceNavigate({
			taskId: reference.id,
			columnId: resolvedColumnId
		});
	};

	syncDraftFromTask(task);

	$: isMobile = viewportWidth > 0 && viewportWidth < 1024;
	$: recentTags = existingTags
		.filter(
			(tag) =>
				!draft.tags.some(
					(current) => current.label.trim().toLowerCase() === tag.label.trim().toLowerCase()
				)
		)
		.slice(0, 6);
	$: draftDueAt = getTaskDueAt(draft);
	$: currentTone =
		SURFACE_TONE_OPTIONS.find((tone) => tone.value === (draft.color || '')) ??
		SURFACE_TONE_OPTIONS[0];
	$: currentTagColorSwatch =
		TAG_COLORS.find((color) => color.value === selectedTagColor) ?? TAG_COLORS[0];
	$: usePanePresentation = !isMobile && presentation === 'pane';
	$: overlayScopeClass = isMobile ? 'fixed' : 'absolute';
	$: resolvedDesktopLayoutMode = isMobile ? 'fullscreen' : desktopLayoutMode;
	$: overlayLayoutClass = isMobile
		? 'items-stretch justify-stretch bg-black/60 p-0 backdrop-blur-md'
		: resolvedDesktopLayoutMode === 'dock'
			? 'items-stretch justify-end bg-black/34 p-0 backdrop-blur-[2px]'
			: resolvedDesktopLayoutMode === 'fullscreen'
				? 'items-stretch justify-stretch bg-black/26 p-0 backdrop-blur-[1px]'
				: 'items-center justify-center bg-black/36 p-4 backdrop-blur-[2px] lg:p-6';
	$: dialogLayoutClass = usePanePresentation
		? 'h-full max-h-none max-w-none rounded-none border-0'
		: isMobile
			? 'h-[100dvh] max-h-[100dvh] rounded-none border-0 pt-[var(--safe-top)]'
			: resolvedDesktopLayoutMode === 'dock'
				? 'h-full max-h-none max-w-[48rem] rounded-none border-l border-app-border'
				: resolvedDesktopLayoutMode === 'fullscreen'
					? 'h-full max-h-none max-w-none rounded-none border-0'
					: 'max-h-full max-w-[70rem] rounded-lg border border-app-border';
	$: chromePaddingClass = isMobile
		? 'px-4 py-3'
		: usePanePresentation
			? 'px-10 pt-5 pb-2'
			: 'px-10 py-10';
	$: bodyPaddingClass = isMobile
		? 'p-3'
		: usePanePresentation
			? 'px-10 py-10'
			: 'p-10';
	$: referenceOptions = [
		...columns.flatMap((column) =>
			column.tasks
				.filter((entry) => entry.id !== task.id)
				.map(
					(entry) =>
						({
							kind: 'task',
							id: entry.id,
							label: entry.title,
							description: column.title,
							searchText: `${entry.title} ${column.title} ${(entry.tags || [])
								.map((tag) => tag.label)
								.join(' ')}`,
							columnId: column.id,
							columnTitle: column.title,
							tags: [...(entry.tags || [])],
							checked: Boolean(entry.checked)
						}) satisfies TaskReferenceOption
				)
		),
		...members.map(
			(member) =>
				({
					kind: 'member',
					id: member.userId,
					label: getProjectMemberDisplayName(member),
					description: member.role,
					searchText: getProjectMemberSearchText(member)
				}) satisfies TaskReferenceOption
		),
		...columns.map(
			(column) =>
				({
					kind: 'column',
					id: column.id,
					label: column.title,
					description: 'Column',
					searchText: `${column.title} column`
				}) satisfies TaskReferenceOption
		)
	];
	$: if (task.id !== activeTaskId) {
		clearAutosaveTimer();
		syncDraftFromTask(task);
		commentDraft = '';
		commentErrorMessage = '';
	}
	$: {
		const nextTaskFingerprint = getTaskFingerprint(task);
		if (task.id === activeTaskId && nextTaskFingerprint !== externalTaskFingerprint) {
			externalTaskFingerprint = nextTaskFingerprint;
			if (getTaskFingerprint(draft) === lastFlushedFingerprint) {
				draft = structuredClone(task);
				lastFlushedFingerprint = nextTaskFingerprint;
				refreshSaveBadge('saved');
			}
		}
	}
	$: {
		const requestedKey = projectId && task.id ? `${projectId}:${task.id}` : '';
		if (requestedKey && requestedKey !== latestDetailsKey) {
			latestDetailsKey = requestedKey;
			void hydrateTaskDetails(requestedKey);
		}
	}
	$: for (const asset of taskAssets) void ensureAssetPreview(asset);
	$: pruneStaleAssetUrls();

	onDestroy(() => {
		clearAutosaveTimer();
		if (descriptionActionTimer) clearTimeout(descriptionActionTimer);
		revokeAllObjectUrls();
	});
</script>

<svelte:window
	bind:innerWidth={viewportWidth}
	on:keydown={(event) => {
		if (event.key === 'Escape') {
			if (tonePickerOpen || tagColorPickerOpen || layoutPickerOpen) {
				tonePickerOpen = false;
				tagColorPickerOpen = false;
				layoutPickerOpen = false;
			} else {
				void requestClose();
			}
		}
	}}
	on:mousedown={() => {
		tonePickerOpen = false;
		tagColorPickerOpen = false;
		layoutPickerOpen = false;
	}}
/>

<div
	class={usePanePresentation
		? 'relative z-50 flex h-full w-full overflow-hidden'
		: `${overlayScopeClass} inset-0 z-50 flex overflow-hidden transition-[background-color,backdrop-filter,padding] duration-200 ${overlayLayoutClass}`}
>
	{#if !usePanePresentation}
		<button
			type="button"
			class="absolute inset-0 cursor-default"
			aria-label="Close task editor"
			on:click={() => void requestClose()}
		></button>
	{/if}

	<div
		role="dialog"
		aria-modal="true"
		aria-label="Task editor"
		class={`relative z-10 flex w-full flex-col overflow-hidden bg-app-surface shadow-kainbu-xl transition-[max-width,max-height,border-radius] duration-200 ${dialogLayoutClass}`}
		style={getModalToneStyle(draft.color)}
	>
		<div
			class={`flex items-start justify-between gap-3 border-b border-app-border bg-app-surface ${chromePaddingClass}`}
		>
			<div class="min-w-0 flex-1">
				<textarea
					bind:value={draft.title}
					use:autoGrowTitle
					rows="2"
					class={`max-h-56 w-full resize-none overflow-y-auto bg-transparent font-display font-bold leading-tight tracking-tight text-app-text outline-none placeholder:text-app-subtext/40 ${
						isMobile ? 'text-[20px]' : 'text-[24px]'
					}`}
					placeholder="Task title"
					on:input={() => {
						refreshSaveBadge('dirty');
						scheduleAutosave();
					}}
					on:blur={() => void flushDraft(true)}
				></textarea>
				<div
					class={`mt-2 flex flex-wrap items-center gap-3 uppercase tracking-[0.25em] text-app-subtext ${
						isMobile ? 'text-[10px]' : 'text-xs'
					}`}
				>
					<span>in {columnTitle}</span>
					<span
						class={`rounded border px-2 py-1 text-[9px] tracking-[0.18em] ${
							saveState === 'saved'
								? 'border-emerald-500/35 text-emerald-200'
								: saveState === 'saving'
									? 'border-app-primary/35 text-app-primary'
									: saveState === 'dirty'
										? 'border-app-border text-app-subtext'
										: 'border-rose-500/35 text-rose-300'
						}`}
					>
						{saveMessage}
					</span>
				</div>
			</div>
			<div class="flex items-center gap-2 pl-2">
				{#if !isMobile}
					<div class="relative">
						<button
							type="button"
							aria-label="Change editor layout"
							title="Change layout"
							class="inline-flex h-10 items-center gap-1 rounded-full border border-app-border bg-app-element px-3 text-app-subtext transition hover:text-app-text"
							on:mousedown|stopPropagation
							on:click={() => (layoutPickerOpen = !layoutPickerOpen)}
						>
							{#if desktopLayoutMode === 'modal'}
								<RectangleHorizontal size={15} />
							{:else if desktopLayoutMode === 'dock'}
								<PanelRightOpen size={15} />
							{:else}
								<Expand size={15} />
							{/if}
							<ChevronDown size={12} class={`transition ${layoutPickerOpen ? 'rotate-180' : ''}`} />
						</button>
						{#if layoutPickerOpen}
							<div
								role="listbox"
								tabindex="-1"
								aria-label="Editor layout options"
								class="absolute right-0 top-full z-20 mt-1.5 rounded border border-app-border bg-app-surface"
								on:mousedown|stopPropagation
							>
								{#each LAYOUT_OPTIONS as option (option.mode)}
									<button
										type="button"
										role="option"
										aria-selected={desktopLayoutMode === option.mode}
										class={`flex w-full items-center gap-2.5 whitespace-nowrap px-3 py-2 text-xs font-semibold transition ${
											desktopLayoutMode === option.mode
												? 'bg-app-primary text-white'
												: 'text-app-subtext hover:bg-app-bg/75 hover:text-app-text'
										}`}
										on:click={() => {
											onDesktopLayoutModeChange(option.mode);
											layoutPickerOpen = false;
										}}
									>
										{#if option.mode === 'modal'}
											<RectangleHorizontal size={14} />
										{:else if option.mode === 'dock'}
											<PanelRightOpen size={14} />
										{:else}
											<Expand size={14} />
										{/if}
										{option.label}
									</button>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
				<button
					type="button"
					class={`inline-flex items-center justify-center text-app-subtext transition hover:text-app-text ${
						isMobile ? 'h-9 w-9' : 'h-10 w-10'
					}`}
					on:click={() => void requestClose()}
				>
					<X size={18} />
				</button>
			</div>
		</div>

		<div class={`min-h-0 flex-1 overflow-y-auto ${bodyPaddingClass}`}>
			<div class={`flex flex-col gap-3 ${isMobile ? 'pb-3' : 'pb-4'}`}>
				<div class="flex items-center gap-2">
					<span class="flex items-center gap-1.5 text-xs font-semibold text-app-subtext">
						<Lock size={13} />
						Status
					</span>
					<button
						type="button"
						class={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
							draft.checked
								? 'border-app-accent/40 bg-app-accent/10 text-app-accent'
								: 'border-app-border bg-app-element text-app-text hover:border-app-primary/40 hover:text-app-primary'
						}`}
						on:click={toggleComplete}
					>
						{#if draft.checked}
							<CheckSquare size={13} />
							Completed
						{:else}
							<Square size={13} />
							Mark Complete
						{/if}
					</button>
				</div>

				<div class="flex items-center gap-2">
					<span class="flex items-center gap-1.5 text-xs font-semibold text-app-subtext">
						<Clock3 size={13} />
						Due
					</span>
					<input
						type="datetime-local"
						class="rounded-full border border-app-border bg-app-element px-3 py-1 text-xs text-app-text outline-none transition focus:border-app-primary/40"
						value={toLocalInputValue(draftDueAt ?? undefined)}
						on:input={(event) => {
							const nextDueAt = fromLocalInputValue(
								(event.currentTarget as HTMLInputElement).value
							);
							mutateDraft(
								(current) =>
									nextDueAt === undefined
										? clearTaskDueAt(current)
										: setTaskDueAt(current, nextDueAt),
								'immediate'
							);
						}}
					/>
					{#if draftDueAt !== null}
						<button
							type="button"
							class="text-xs font-semibold text-app-subtext transition hover:text-app-primary"
							on:click={() => mutateDraft((current) => clearTaskDueAt(current), 'immediate')}
						>
							Clear
						</button>
					{/if}
				</div>

				<div class="relative flex items-center gap-2">
					<span class="flex items-center gap-1.5 text-xs font-semibold text-app-subtext">
						<TagIcon size={13} />
						Tone
					</span>
					<button
						type="button"
						class="inline-flex items-center gap-1.5 rounded-full border border-app-border bg-app-element px-3 py-1 text-xs font-semibold text-app-text transition hover:border-app-primary/40"
						on:mousedown|stopPropagation
						on:click={() => (tonePickerOpen = !tonePickerOpen)}
					>
						<span class={`inline-block h-4 w-4 rounded-sm border ${currentTone.swatchClass}`}></span>
						{currentTone.label}
						<ChevronDown size={12} class={`transition ${tonePickerOpen ? 'rotate-180' : ''}`} />
					</button>
					{#if tonePickerOpen}
						<div
							role="presentation"
							class="absolute left-0 top-full z-20 mt-1.5 rounded border border-app-border bg-app-surface p-2"
							on:mousedown|stopPropagation
						>
							<div class="flex flex-wrap gap-1.5">
								{#each SURFACE_TONE_OPTIONS as tone}
									<button
										type="button"
										aria-label={`Set card tone to ${tone.label}`}
										title={tone.label}
										class={`h-7 w-7 rounded-sm border p-0 transition ${tone.swatchClass} ${
											(draft.color || '') === tone.value
												? 'scale-110 border-white/80 ring-2 ring-app-primary/45'
												: 'hover:scale-110 hover:border-app-primary/35'
										}`}
										on:click={() => {
											setTaskColor(tone.value);
											tonePickerOpen = false;
										}}
									></button>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</div>

			<div class="border-t border-app-border py-3">
				<div class="flex flex-wrap items-start gap-2">
					<span class="flex items-center gap-1.5 py-1 text-xs font-semibold text-app-subtext">
						<TagIcon size={13} />
						Tags
					</span>
					{#if draft.tags.length}
						{#each draft.tags as tag (tag.id)}
							<span
								class={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${getTagToneClasses(tag.color)}`}
							>
								{tag.label}
								<button
									type="button"
									class="opacity-70 transition hover:opacity-100"
									on:click={() => deleteTag(tag.id)}
								>
									<X size={11} />
								</button>
							</span>
						{/each}
					{/if}
				</div>
				<div class="mt-2 flex items-center gap-2">
					<input
						bind:value={tagSearch}
						class="min-w-0 max-w-56 flex-1 rounded-full border border-app-border bg-app-element px-3 py-1 text-xs text-app-text outline-none transition focus:border-app-primary/40"
						placeholder="New tag..."
						on:keydown={(event) => {
							if (event.key === 'Enter') addTag(tagSearch || 'New Tag', selectedTagColor);
						}}
					/>
					<div class="relative">
						<button
							type="button"
							class="inline-flex items-center gap-1 rounded-full border border-app-border bg-app-element px-2 py-1 text-xs text-app-text transition hover:border-app-primary/40"
							on:mousedown|stopPropagation
							on:click={() => (tagColorPickerOpen = !tagColorPickerOpen)}
						>
							<span class={`inline-block h-4 w-4 rounded-sm border ${currentTagColorSwatch.swatchClass}`}
							></span>
							<ChevronDown
								size={11}
								class={`transition ${tagColorPickerOpen ? 'rotate-180' : ''}`}
							/>
						</button>
						{#if tagColorPickerOpen}
							<div
								role="presentation"
								class="absolute right-0 top-full z-20 mt-1.5 w-[14.5rem] max-w-[min(14.5rem,calc(100vw-3rem))] rounded border border-app-border bg-app-surface p-3"
								on:mousedown|stopPropagation
							>
								<p class="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-app-subtext">
									Tag color
								</p>
								<div class="grid grid-cols-4 gap-2">
									{#each TAG_COLORS as color}
										<button
											type="button"
											aria-label={`Select ${color.value.replace('tone:', '')} color`}
											title={color.value.replace('tone:', '')}
											class={`h-8 w-8 border p-0 transition ${color.swatchClass} ${
												selectedTagColor === color.value
													? 'border-white/80 ring-2 ring-app-primary/45 ring-offset-2 ring-offset-app-surface'
													: 'hover:-translate-y-0.5 hover:border-app-primary/35'
											}`}
											on:click={() => {
												selectedTagColor = color.value;
												tagColorPickerOpen = false;
											}}
										></button>
									{/each}
								</div>
							</div>
						{/if}
					</div>
					<button
						type="button"
						class="rounded-full bg-app-primary px-2 py-1 text-xs font-semibold text-white transition hover:bg-app-primary-hover"
						on:click={() => addTag(tagSearch || 'New Tag', selectedTagColor)}
					>
						<TagIcon size={12} />
					</button>
				</div>
				{#if recentTags.length}
					<div class="mt-2 flex flex-wrap items-center gap-1.5">
						<span class="text-[10px] font-bold uppercase tracking-[0.2em] text-app-subtext">
							Recent
						</span>
						{#each recentTags as tag (tag.id)}
							<button
								type="button"
								class={`rounded-full px-2 py-0.5 text-[11px] font-semibold transition hover:opacity-100 ${getTagToneClasses(tag.color)}`}
								on:click={() => addTag(tag.label, tag.color)}
							>
								{tag.label}
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<div class="border-t border-app-border pt-3">
				<div class="mb-2 flex items-center justify-between gap-3">
					<div class="flex items-center gap-2 text-xs font-semibold text-app-subtext">
						<FileText size={13} />
						Description
					</div>
					<div class="flex items-center gap-2">
						{#if descriptionActionMessage}
							<span class="text-[11px] text-app-subtext">{descriptionActionMessage}</span>
						{/if}
						<button
							type="button"
							class="inline-flex items-center gap-1.5 rounded-full border border-app-border bg-app-element px-3 py-1.5 text-[11px] font-semibold text-app-text transition hover:border-app-primary/35 hover:text-app-primary"
							on:click={() => void handleCopyDescriptionMarkdown()}
						>
							<Copy size={12} />
							Copy Markdown
						</button>
					</div>
				</div>
				<div class="task-modal__description-editor">
					<MarkdownBlockEditor
						value={draft.description || ''}
						{assetUrls}
						{referenceOptions}
						onReferenceNavigate={handleReferenceNavigate}
						onEmbedDelete={handleEmbeddedImageDelete}
						onEmbedAddToChat={handleEmbeddedImageAddToChat}
						onChange={(nextValue, options) =>
							mutateDraft(
								(current) => ({
									...current,
									description: nextValue
								}),
								options?.immediate ? 'immediate' : 'debounced'
							)}
						onImageUpload={handleEmbedUpload}
						onCheckboxToggle={toggleDescriptionCheckbox}
						placeholder={'## Notes\n- Structure the task\n- Add context\n- Paste images'}
					/>
				</div>
			</div>

			<div class="border-t border-app-border pt-4">
				<div class="mb-3 flex items-center justify-between gap-3">
					<div class="flex items-center gap-2 text-xs font-semibold text-app-subtext">
						<Paperclip size={13} />
						Attachments
					</div>
					<div class="flex items-center gap-2">
						<button
							type="button"
							class="inline-flex items-center gap-2 rounded-full border border-app-border bg-app-element px-3 py-2 text-xs font-semibold text-app-text transition hover:border-app-primary/35 hover:text-app-primary"
							on:click={() => attachmentInput?.click()}
						>
							<Upload size={13} />
							Add files
						</button>
						<input
							bind:this={attachmentInput}
							type="file"
							multiple
							class="hidden"
							on:change={(event) => {
								const files = Array.from((event.currentTarget as HTMLInputElement).files || []);
								(event.currentTarget as HTMLInputElement).value = '';
								void handleAttachmentFiles(files);
							}}
						/>
					</div>
				</div>

				{#if detailsLoading && !taskAssets.length && !pendingUploads.length}
					<p class="text-sm text-app-subtext">Loading attachments…</p>
				{:else}
					<div class="flex gap-3 overflow-x-auto pb-2">
						{#each pendingUploads as pendingUpload (`pending-${pendingUpload.tempId}`)}
							<div class="w-[15rem] shrink-0 rounded-md border border-app-border bg-app-bg/55 p-3">
								{#if isImageMimeType(pendingUpload.mimeType) && assetUrls[`pending:${pendingUpload.tempId}`]}
									<img
										src={assetUrls[`pending:${pendingUpload.tempId}`]}
										alt={pendingUpload.name}
										class="mb-3 h-28 w-full rounded border border-app-border object-cover"
									/>
								{/if}
								<div class="flex items-start justify-between gap-2">
									<div class="min-w-0">
										<p class="truncate text-sm font-semibold text-app-text">{pendingUpload.name}</p>
										<p class="mt-1 text-[11px] uppercase tracking-[0.18em] text-app-subtext">
											{pendingUpload.kind}
										</p>
									</div>
									<LoaderCircle size={15} class="animate-spin text-app-primary" />
								</div>
							</div>
						{/each}

						{#each taskAssets as asset (asset.id)}
							<div class="w-[15rem] shrink-0 rounded-md border border-app-border bg-app-bg/55 p-3">
								{#if isImageMimeType(asset.mimeType) && assetUrls[asset.id]}
									<img
										src={assetUrls[asset.id]}
										alt={asset.name}
										class="mb-3 h-28 w-full rounded border border-app-border object-cover"
									/>
								{/if}
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0">
										<p class="truncate text-sm font-semibold text-app-text">{asset.name}</p>
										<p class="mt-1 text-[11px] uppercase tracking-[0.18em] text-app-subtext">
											{asset.mimeType || asset.kind}
										</p>
										<p class="mt-2 text-xs text-app-subtext">
											Shared by {getMemberLabel(asset.uploadedByUserId)}
										</p>
									</div>
									<div class="flex shrink-0 items-center gap-1">
										<button
											type="button"
											class="rounded border border-app-border p-2 text-app-subtext transition hover:border-app-primary/35 hover:text-app-primary"
											on:click={() => void handleDownloadAsset(asset)}
										>
											<Download size={13} />
										</button>
										<button
											type="button"
											class="rounded border border-app-border p-2 text-app-subtext transition hover:border-rose-500/35 hover:text-rose-300"
											on:click={() => void handleDeleteAsset(asset)}
										>
											<Trash2 size={13} />
										</button>
									</div>
								</div>
							</div>
						{/each}

						{#if !taskAssets.length && !pendingUploads.length}
							<div
								class="rounded-md border border-dashed border-app-border px-4 py-5 text-sm text-app-subtext"
							>
								No files attached yet.
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<div class="border-t border-app-border pt-4">
				<div class="mb-3 flex items-center gap-2 text-xs font-semibold text-app-subtext">
					<MessageSquare size={13} />
					Comments
				</div>

				<div class="rounded-md border border-app-border bg-app-bg/45">
					<div class="space-y-0 divide-y divide-app-border">
						{#if taskComments.length}
							{#each taskComments as comment (comment.id)}
								<div class="px-3 py-3">
									<div
										class="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.18em] text-app-subtext"
									>
										<span>{getMemberLabel(comment.authorUserId)}</span>
										<span>{new Date(comment.createdAt).toLocaleString()}</span>
									</div>
									<p class="mt-2 text-sm leading-relaxed text-app-text">{comment.body}</p>
								</div>
							{/each}
						{:else if detailsLoading}
							<p class="px-3 py-4 text-sm text-app-subtext">Loading comments…</p>
						{:else}
							<p class="px-3 py-4 text-sm text-app-subtext">No comments yet.</p>
						{/if}
					</div>

					<div class="border-t border-app-border px-3 py-3">
						<textarea
							bind:value={commentDraft}
							rows="3"
							class="w-full resize-y bg-transparent text-sm leading-relaxed text-app-text outline-none placeholder:text-app-subtext/45"
							placeholder="Add a comment for collaborators…"
						></textarea>
						<div class="mt-3 flex items-center justify-between gap-3">
							<div class="text-sm text-rose-300">
								{commentErrorMessage || detailsErrorMessage}
							</div>
							<button
								type="button"
								class="inline-flex items-center gap-2 rounded bg-app-primary px-3 py-2 text-sm font-semibold text-white transition hover:bg-app-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
								disabled={commentSubmitting || !commentDraft.trim().length}
								on:click={() => void handleAddComment()}
							>
								{#if commentSubmitting}
									<LoaderCircle size={14} class="animate-spin" />
								{:else}
									<Check size={14} />
								{/if}
								Comment
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	:global(.task-modal__description-editor .markdown-editor__surface),
	:global(.task-modal__description-editor .markdown-editor__prosemirror) {
		min-height: 8rem;
	}
</style>
