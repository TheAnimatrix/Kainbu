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
		Link2,
		LoaderCircle,
		Lock,
		MessageSquare,
		PanelRightOpen,
		Paperclip,
		RectangleHorizontal,
		Square,
		Tag as TagIcon,
		Trash2,
		Unlink,
		Upload,
		X
	} from '$lib/icons';
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
		hasLeadingCardCheckboxLine,
		replaceAssetEmbedsForClipboard,
		stripAssetEmbeds,
		syncLeadingCardCheckboxLine,
		toggleMarkdownCheckbox,
		type TaskReferenceOption
	} from '$lib/kainbu/taskMarkdown';
	import { clearTaskDueAt, getTaskDueAt, setTaskDueAt } from '$lib/kainbu/timing';
	import {
		getExplicitLinkedTasks,
		normalizeLinkedTaskIds,
		parseTaskReferenceIds,
		removeTaskReferenceFromMarkdown
	} from '$lib/kainbu/taskLinks';
	import { getModalToneStyle, getTagToneClasses } from '$lib/kainbu/tags';
	import type {
		ChatAttachment,
		ColorMode,
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
	export let colorMode: ColorMode = 'dark';
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
	export let onUnlinkLinkedTask: ((linkedTaskId: string) => void) | undefined = undefined;
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
	let activeTab: 'properties' | 'files' | 'comments' | null = null;

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
			assignedTo: candidate.assignedTo || '',
			linkedTaskIds: normalizeLinkedTaskIds(candidate.linkedTaskIds).sort()
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
			const blob = await downloadTaskAssetBlob(asset);
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
				title:
					current.hasCheckbox && hasLeadingCardCheckboxLine(current.title || '')
						? syncLeadingCardCheckboxLine(current.title || '', checked)
						: current.title,
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

	const toggleTitleCheckbox = (index: number, checked: boolean) => {
		if (!draft.title) return;
		mutateDraft(
			(current) => ({
				...current,
				title: toggleMarkdownCheckbox(current.title || '', index, checked)
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
		const nextTitle = stripAssetEmbeds(draft.title || '', asset.id);
		const nextDescription = stripAssetEmbeds(draft.description || '', asset.id);
		if (nextTitle !== (draft.title || '') || nextDescription !== (draft.description || '')) {
			draft = { ...draft, title: nextTitle, description: nextDescription };
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
			const blob = await downloadTaskAssetBlob(asset);
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

		const nextTitle = stripAssetEmbeds(draft.title || '', assetId);
		const nextDescription = stripAssetEmbeds(draft.description || '', assetId);
		if (nextTitle === (draft.title || '') && nextDescription === (draft.description || '')) return;
		mutateDraft(
			(current) => ({
				...current,
				title: nextTitle,
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

		const blob = await downloadTaskAssetBlob(asset);
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

	const handleReferenceRemove = (reference: TaskReferenceOption) => {
		if (reference.kind !== 'task') return;
		mutateDraft(
			(current) => ({
				...current,
				title: removeTaskReferenceFromMarkdown(current.title, reference.id),
				description: removeTaskReferenceFromMarkdown(current.description, reference.id)
			}),
			'immediate'
		);
	};

	const handleReferencePromote = (reference: TaskReferenceOption) => {
		if (reference.kind !== 'task' || reference.id === draft.id) return;
		mutateDraft(
			(current) => ({
				...current,
				linkedTaskIds: normalizeLinkedTaskIds([
					...(current.linkedTaskIds || []),
					reference.id
				])
			}),
			'immediate'
		);
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
					: 'max-h-full max-w-[70rem] rounded-xl border border-app-border';
	$: chromePaddingClass = isMobile
		? 'px-3 py-2'
		: usePanePresentation
			? 'px-5 py-2'
			: 'px-5 py-2';
	$: bodyPaddingClass = isMobile
		? 'px-4 py-4'
		: 'px-5 py-4';
	$: explicitLinkedTasks = getExplicitLinkedTasks(columns, draft.id);
	$: implicitReferenceIds = parseTaskReferenceIds(draft.description).filter(
		(taskId) =>
			taskId !== draft.id &&
			!normalizeLinkedTaskIds(draft.linkedTaskIds).includes(taskId)
	);
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
		style={getModalToneStyle(draft.color, colorMode)}
	>
		<div
			class={`flex items-center justify-between gap-3 border-b border-app-border bg-app-surface ${chromePaddingClass}`}
		>
			<div class="flex min-w-0 flex-1 items-center gap-3 text-xs">
				<span class="truncate text-app-subtext">
					in <span class="font-medium text-app-text">{columnTitle}</span>
				</span>
				<span
					class={`inline-flex shrink-0 items-center gap-1.5 text-[11px] ${
						saveState === 'saved'
							? 'text-app-subtext'
							: saveState === 'saving'
								? 'text-app-primary'
								: saveState === 'dirty'
									? 'text-app-subtext'
									: 'text-rose-300'
					}`}
					title={saveMessage}
				>
					<span
						class={`inline-block h-1.5 w-1.5 rounded-full ${
							saveState === 'saved'
								? 'bg-emerald-400/80'
								: saveState === 'saving'
									? 'bg-app-primary animate-pulse'
									: saveState === 'dirty'
										? 'bg-app-subtext/55'
										: 'bg-rose-400/80'
						}`}
					></span>
					<span class="hidden sm:inline">
						{saveState === 'saved'
							? 'Saved'
							: saveState === 'saving'
								? 'Saving…'
								: saveState === 'dirty'
									? 'Unsaved'
									: 'Error'}
					</span>
				</span>
			</div>
			<div class="flex items-center gap-1">
				{#if !isMobile}
					<div class="mr-1 inline-flex items-center rounded-md border border-app-border bg-app-element/40 p-0.5">
						{#each LAYOUT_OPTIONS as option (option.mode)}
							<button
								type="button"
								aria-label={option.label}
								title={option.label}
								class={`inline-flex h-6 w-6 items-center justify-center rounded transition ${
									desktopLayoutMode === option.mode
										? 'bg-app-surface text-app-text shadow-sm'
										: 'text-app-subtext hover:text-app-text'
								}`}
								on:click={() => onDesktopLayoutModeChange(option.mode)}
							>
								{#if option.mode === 'modal'}
									<RectangleHorizontal size={13} />
								{:else if option.mode === 'dock'}
									<PanelRightOpen size={13} />
								{:else}
									<Expand size={13} />
								{/if}
							</button>
						{/each}
					</div>
				{/if}
				<button
					type="button"
					aria-label="Close"
					title="Close"
					class="inline-flex h-7 w-7 items-center justify-center rounded-md text-app-subtext transition hover:bg-app-element/40 hover:text-app-text"
					on:click={() => void requestClose()}
				>
					<X size={16} />
				</button>
			</div>
		</div>

		<div class="flex min-h-0 flex-1 flex-col">
			<!-- Scrollable document area -->
			<div class={`flex-1 overflow-y-auto ${bodyPaddingClass}`}>
				<div class="mx-auto flex w-full max-w-3xl flex-col gap-3">
					<div class="task-modal__doc group/doc relative">
						<div class="pointer-events-none absolute right-0 top-1 z-10 flex items-center gap-2 opacity-0 transition group-hover/doc:opacity-100 group-focus-within/doc:opacity-100">
							{#if descriptionActionMessage}
								<span class="pointer-events-auto text-[11px] text-app-subtext">{descriptionActionMessage}</span>
							{/if}
							<button
								type="button"
								class="pointer-events-auto inline-flex items-center gap-1.5 rounded-md border border-app-border bg-app-surface/85 px-2 py-1 text-[11px] font-semibold text-app-subtext backdrop-blur transition hover:border-app-primary/35 hover:text-app-primary"
								title="Copy markdown"
								on:click={() => void handleCopyDescriptionMarkdown()}
							>
								<Copy size={11} />
								Copy
							</button>
						</div>

						<div class="flex items-start gap-2.5">
							{#if draft.hasCheckbox}
								<button
									type="button"
									aria-label={draft.checked ? 'Mark incomplete' : 'Mark complete'}
									title={draft.checked ? 'Mark incomplete' : 'Mark complete'}
									class={`mt-[0.35rem] inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[0.25rem] border-[1.5px] transition ${
										draft.checked
											? 'border-app-primary bg-app-primary text-white'
											: 'border-app-subtext hover:border-app-primary hover:bg-app-element/40'
									}`}
									on:click={toggleComplete}
								>
									{#if draft.checked}
										<Check size={11} strokeWidth={3} />
									{/if}
								</button>
							{/if}
							<div class="task-modal__title-editor min-w-0 flex-1">
								<MarkdownBlockEditor
									value={draft.title || ''}
									{assetUrls}
									{referenceOptions}
									onReferenceNavigate={handleReferenceNavigate}
									onReferenceRemove={handleReferenceRemove}
									onReferencePromote={handleReferencePromote}
									onEmbedDelete={handleEmbeddedImageDelete}
									onEmbedAddToChat={handleEmbeddedImageAddToChat}
									onChange={(nextValue, options) =>
										mutateDraft(
											(current) => ({
												...current,
												title: nextValue
											}),
											options?.immediate ? 'immediate' : 'debounced'
										)}
									onImageUpload={handleEmbedUpload}
									onCheckboxToggle={toggleTitleCheckbox}
								/>
							</div>
						</div>

						<div class="task-modal__description-editor">
							<MarkdownBlockEditor
								value={draft.description || ''}
								{assetUrls}
								{referenceOptions}
								onReferenceNavigate={handleReferenceNavigate}
								onReferenceRemove={handleReferenceRemove}
								onReferencePromote={handleReferencePromote}
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
								placeholder={'Add notes, paste images, link tasks…'}
							/>
						</div>
					</div>
				</div>
			</div>

			<!-- Tab panel (fixed above tab strip) -->
			{#if activeTab}
				<div class="shrink-0 max-h-[42vh] overflow-y-auto border-t border-app-border bg-app-bg/30">
					<div class={`mx-auto w-full max-w-3xl ${isMobile ? 'px-4 py-4' : 'px-5 py-4'}`}>
						{#if activeTab === 'properties'}
							<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
								{#if draft.hasCheckbox}
									<div class="flex flex-col gap-1.5">
										<span class="text-[10px] font-bold uppercase tracking-[0.2em] text-app-subtext">Status</span>
										<button
											type="button"
											class={`inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
												draft.checked
													? 'border-app-accent/40 bg-app-accent/10 text-app-accent'
													: 'border-app-border bg-app-element/40 text-app-text hover:border-app-primary/40'
											}`}
											on:click={toggleComplete}
										>
											{#if draft.checked}
												<CheckSquare size={13} />
												Completed
											{:else}
												<Square size={13} />
												Open
											{/if}
										</button>
									</div>
								{/if}

								<div class="flex flex-col gap-1.5">
									<span class="text-[10px] font-bold uppercase tracking-[0.2em] text-app-subtext">Due</span>
									<label class="inline-flex w-fit items-center gap-1.5 rounded-full border border-app-border bg-app-element/40 px-3 py-1 text-xs text-app-text transition focus-within:border-app-primary/40">
										<Clock3 size={13} class="text-app-subtext" />
										<input
											type="datetime-local"
											class="bg-transparent text-xs text-app-text outline-none [color-scheme:dark]"
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
												class="ml-0.5 text-app-subtext transition hover:text-rose-300"
												aria-label="Clear due date"
												on:click|preventDefault={() =>
													mutateDraft((current) => clearTaskDueAt(current), 'immediate')}
											>
												<X size={11} />
											</button>
										{/if}
									</label>
								</div>

								<div class="relative flex flex-col gap-1.5">
									<span class="text-[10px] font-bold uppercase tracking-[0.2em] text-app-subtext">Tone</span>
									<button
										type="button"
										class="inline-flex w-fit items-center gap-1.5 rounded-full border border-app-border bg-app-element/40 px-3 py-1 text-xs font-semibold text-app-text transition hover:border-app-primary/40"
										on:mousedown|stopPropagation
										on:click={() => (tonePickerOpen = !tonePickerOpen)}
									>
										<span class={`inline-block h-3.5 w-3.5 rounded-sm border ${currentTone.swatchClass}`}></span>
										{currentTone.label}
										<ChevronDown size={12} class={`transition ${tonePickerOpen ? 'rotate-180' : ''}`} />
									</button>
									{#if tonePickerOpen}
										<div
											role="presentation"
											class="absolute left-0 bottom-full z-20 mb-1.5 rounded-md border border-app-border bg-app-surface p-2 shadow-kainbu-md"
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

								<div class="flex flex-col gap-1.5 sm:col-span-2">
									<span class="text-[10px] font-bold uppercase tracking-[0.2em] text-app-subtext">Tags</span>
									<div class="flex flex-wrap items-center gap-1.5">
										{#each draft.tags as tag (tag.id)}
												<span class={`${getTagToneClasses(tag.color)} kainbu-tag-tone--lg gap-1.5`}>
												{tag.label}
												<button type="button" class="opacity-70 transition hover:opacity-100" on:click={() => deleteTag(tag.id)}>
													<X size={11} />
												</button>
											</span>
										{/each}
										<div class="inline-flex items-center gap-1 rounded-full border border-app-border bg-app-element/40 pl-3 pr-1 py-0.5 transition focus-within:border-app-primary/40">
											<TagIcon size={12} class="text-app-subtext" />
											<input
												bind:value={tagSearch}
												class="w-28 bg-transparent py-0.5 text-xs text-app-text outline-none placeholder:text-app-subtext/60"
												placeholder="Add tag"
												on:keydown={(event) => {
													if (event.key === 'Enter') addTag(tagSearch || 'New Tag', selectedTagColor);
												}}
											/>
											<div class="relative">
												<button
													type="button"
													class="inline-flex items-center rounded-full p-1 text-app-subtext transition hover:text-app-text"
													aria-label="Pick tag color"
													on:mousedown|stopPropagation
													on:click={() => (tagColorPickerOpen = !tagColorPickerOpen)}
												>
													<span class={`inline-block h-3.5 w-3.5 rounded-sm border ${currentTagColorSwatch.swatchClass}`}></span>
												</button>
												{#if tagColorPickerOpen}
													<div
														role="presentation"
														class="absolute right-0 bottom-full z-20 mb-1.5 w-[14.5rem] max-w-[min(14.5rem,calc(100vw-3rem))] rounded-md border border-app-border bg-app-surface p-3 shadow-kainbu-md"
														on:mousedown|stopPropagation
													>
														<p class="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-app-subtext">Tag color</p>
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
												class="ml-0.5 rounded-full bg-app-primary p-1 text-white transition hover:bg-app-primary-hover"
												aria-label="Add tag"
												on:click={() => addTag(tagSearch || 'New Tag', selectedTagColor)}
											>
												<Check size={11} />
											</button>
										</div>
									</div>
									{#if recentTags.length}
										<div class="flex flex-wrap items-center gap-1.5">
											{#each recentTags as tag (tag.id)}
												<button
													type="button"
													class={`${getTagToneClasses(tag.color)} kainbu-tag-tone--lg transition hover:opacity-100`}
													on:click={() => addTag(tag.label, tag.color)}
												>
													{tag.label}
												</button>
											{/each}
										</div>
									{/if}
								</div>

								{#if explicitLinkedTasks.length || implicitReferenceIds.length}
									<div class="flex flex-col gap-1.5 sm:col-span-2">
										<span class="text-[10px] font-bold uppercase tracking-[0.2em] text-app-subtext">Linked tasks</span>
										<div class="space-y-1.5">
											{#each explicitLinkedTasks as linkedPlacement (linkedPlacement.task.id)}
												<div class="flex items-center justify-between gap-2 rounded-lg border border-app-border bg-app-bg/40 px-3 py-2">
													<button
														type="button"
														class="min-w-0 flex-1 text-left"
														on:click={() =>
															void handleReferenceNavigate({
																kind: 'task',
																id: linkedPlacement.task.id,
																label: linkedPlacement.task.title,
																searchText: linkedPlacement.task.title,
																columnId: linkedPlacement.columnId,
																columnTitle: linkedPlacement.columnTitle
															})}
													>
														<p class="truncate text-sm font-medium text-app-text">{linkedPlacement.task.title}</p>
														<p class="text-[11px] text-app-subtext">{linkedPlacement.columnTitle}</p>
													</button>
													{#if onUnlinkLinkedTask}
														<button
															type="button"
															class="inline-flex items-center gap-1 rounded-md border border-app-border px-2 py-1 text-[11px] font-semibold text-app-subtext transition hover:border-rose-400/40 hover:text-rose-300"
															on:click={() => {
																onUnlinkLinkedTask?.(linkedPlacement.task.id);
																mutateDraft(
																	(current) => ({
																		...current,
																		linkedTaskIds: normalizeLinkedTaskIds(current.linkedTaskIds).filter(
																			(entry) => entry !== linkedPlacement.task.id
																		)
																	}),
																	'immediate'
																);
															}}
														>
															<Unlink size={12} />
															Unlink
														</button>
													{/if}
												</div>
											{/each}
											{#if implicitReferenceIds.length}
												<p class="px-1 text-[11px] text-app-subtext">
													Also referenced in description: {implicitReferenceIds.length} task{implicitReferenceIds.length === 1 ? '' : 's'}
												</p>
											{/if}
										</div>
									</div>
								{/if}
							</div>
						{/if}

						{#if activeTab === 'files'}
							<div>
								{#if detailsLoading && !taskAssets.length && !pendingUploads.length}
									<p class="text-sm text-app-subtext">Loading attachments…</p>
								{:else}
									<div class="flex gap-3 overflow-x-auto pb-2">
										{#each pendingUploads as pendingUpload (`pending-${pendingUpload.tempId}`)}
											<div class="w-[14rem] shrink-0 rounded-lg border border-app-border bg-app-bg/40 p-2.5">
												{#if isImageMimeType(pendingUpload.mimeType) && assetUrls[`pending:${pendingUpload.tempId}`]}
													<img src={assetUrls[`pending:${pendingUpload.tempId}`]} alt={pendingUpload.name} class="mb-2 h-24 w-full rounded border border-app-border object-cover" />
												{/if}
												<div class="flex items-start justify-between gap-2">
													<div class="min-w-0">
														<p class="truncate text-sm font-semibold text-app-text">{pendingUpload.name}</p>
														<p class="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-app-subtext">{pendingUpload.kind}</p>
													</div>
													<LoaderCircle size={14} class="animate-spin text-app-primary" />
												</div>
											</div>
										{/each}
										{#each taskAssets as asset (asset.id)}
											<div class="w-[14rem] shrink-0 rounded-lg border border-app-border bg-app-bg/40 p-2.5">
												{#if isImageMimeType(asset.mimeType) && assetUrls[asset.id]}
													<img src={assetUrls[asset.id]} alt={asset.name} class="mb-2 h-24 w-full rounded border border-app-border object-cover" />
												{/if}
												<div class="flex items-start justify-between gap-2">
													<div class="min-w-0">
														<p class="truncate text-sm font-semibold text-app-text">{asset.name}</p>
														<p class="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-app-subtext">{asset.mimeType || asset.kind}</p>
														<p class="mt-1.5 text-xs text-app-subtext">Shared by {getMemberLabel(asset.uploadedByUserId)}</p>
													</div>
													<div class="flex shrink-0 items-center gap-1">
														<button type="button" class="rounded border border-app-border p-1.5 text-app-subtext transition hover:border-app-primary/35 hover:text-app-primary" on:click={() => void handleDownloadAsset(asset)}>
															<Download size={12} />
														</button>
														<button type="button" class="rounded border border-app-border p-1.5 text-app-subtext transition hover:border-rose-500/35 hover:text-rose-300" on:click={() => void handleDeleteAsset(asset)}>
															<Trash2 size={12} />
														</button>
													</div>
												</div>
											</div>
										{/each}
										{#if !taskAssets.length && !pendingUploads.length}
											<div class="rounded-lg border border-dashed border-app-border px-4 py-4 text-sm text-app-subtext">
												No files attached yet.
											</div>
										{/if}
									</div>
								{/if}
							</div>
						{/if}

						{#if activeTab === 'comments'}
							<div>
								<div class="divide-y divide-app-border">
									{#if taskComments.length}
										{#each taskComments as comment (comment.id)}
											<div class="py-2.5">
												<div class="flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.18em] text-app-subtext">
													<span>{getMemberLabel(comment.authorUserId)}</span>
													<span>{new Date(comment.createdAt).toLocaleString()}</span>
												</div>
												<p class="mt-1 text-sm leading-relaxed text-app-text">{comment.body}</p>
											</div>
										{/each}
									{:else if detailsLoading}
										<p class="py-2 text-sm text-app-subtext">Loading comments…</p>
									{:else}
										<p class="py-2 text-sm text-app-subtext">No comments yet.</p>
									{/if}
								</div>

								<div class="mt-3 rounded-lg border border-app-border bg-app-bg/30 px-3 py-2">
									<textarea
										bind:value={commentDraft}
										rows="2"
										class="w-full resize-y bg-transparent text-sm leading-relaxed text-app-text outline-none placeholder:text-app-subtext/45"
										placeholder="Add a comment for collaborators…"
									></textarea>
									<div class="mt-2 flex items-center justify-between gap-3">
										<div class="text-xs text-rose-300">
											{commentErrorMessage || detailsErrorMessage}
										</div>
										<button
											type="button"
											class="kainbu-btn kainbu-btn--primary kainbu-btn--compact inline-flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50"
											disabled={commentSubmitting || !commentDraft.trim().length}
											on:click={() => void handleAddComment()}
										>
											{#if commentSubmitting}
												<LoaderCircle size={12} class="animate-spin" />
											{:else}
												<Check size={12} />
											{/if}
											Comment
										</button>
									</div>
								</div>
							</div>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Tab strip (fixed at bottom) -->
			<div class="shrink-0 border-t border-app-border bg-app-surface">
				<div class={`mx-auto flex w-full max-w-3xl items-center gap-1 ${isMobile ? 'px-4' : 'px-5'}`}>
					<button
						type="button"
						aria-pressed={activeTab === 'properties'}
						title="Properties"
						class={`inline-flex flex-1 items-center justify-center gap-1.5 border-t-2 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition ${
							activeTab === 'properties'
								? 'border-app-primary text-app-text'
								: 'border-transparent text-app-subtext hover:text-app-text'
						}`}
						on:click={() => (activeTab = activeTab === 'properties' ? null : 'properties')}
					>
						<Lock size={13} />
						<span class="hidden sm:inline">Properties</span>
						{#if explicitLinkedTasks.length + implicitReferenceIds.length > 0}
							<span class="rounded-full bg-app-element px-1.5 py-0.5 text-[10px] tracking-normal text-app-subtext">
								{explicitLinkedTasks.length + implicitReferenceIds.length}
							</span>
						{/if}
					</button>
					<button
						type="button"
						aria-pressed={activeTab === 'files'}
						title="Files"
						class={`inline-flex flex-1 items-center justify-center gap-1.5 border-t-2 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition ${
							activeTab === 'files'
								? 'border-app-primary text-app-text'
								: 'border-transparent text-app-subtext hover:text-app-text'
						}`}
						on:click={() => (activeTab = activeTab === 'files' ? null : 'files')}
					>
						<Paperclip size={13} />
						<span class="hidden sm:inline">Files</span>
						{#if taskAssets.length + pendingUploads.length > 0}
							<span class="rounded-full bg-app-element px-1.5 py-0.5 text-[10px] tracking-normal text-app-subtext">
								{taskAssets.length + pendingUploads.length}
							</span>
						{/if}
					</button>
					<button
						type="button"
						aria-pressed={activeTab === 'comments'}
						title="Comments"
						class={`inline-flex flex-1 items-center justify-center gap-1.5 border-t-2 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] transition ${
							activeTab === 'comments'
								? 'border-app-primary text-app-text'
								: 'border-transparent text-app-subtext hover:text-app-text'
						}`}
						on:click={() => (activeTab = activeTab === 'comments' ? null : 'comments')}
					>
						<MessageSquare size={13} />
						<span class="hidden sm:inline">Comments</span>
						{#if taskComments.length > 0}
							<span class="rounded-full bg-app-element px-1.5 py-0.5 text-[10px] tracking-normal text-app-subtext">
								{taskComments.length}
							</span>
						{/if}
					</button>
					{#if activeTab === 'files'}
						<button
							type="button"
							class="ml-1 inline-flex items-center gap-1.5 rounded-md border border-app-border bg-app-element/40 px-2 py-1 text-[11px] font-semibold text-app-subtext transition hover:border-app-primary/35 hover:text-app-primary"
							on:click={() => attachmentInput?.click()}
						>
							<Upload size={11} />
							Add
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
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.task-modal__doc {
		display: flex;
		flex-direction: column;
	}

	:global(.task-modal__title-editor .markdown-editor__surface),
	:global(.task-modal__title-editor .markdown-editor__prosemirror) {
		min-height: auto;
	}

	:global(.task-modal__title-editor .markdown-editor__surface) {
		padding-bottom: 0.25rem;
	}

	:global(.task-modal__title-editor .markdown-editor__prosemirror) {
		font-family: var(--font-display), ui-serif, Georgia, serif;
		font-size: 1.375rem;
		font-weight: 700;
		line-height: 1.25;
		letter-spacing: -0.02em;
	}

	:global(.task-modal__description-editor .markdown-editor__surface) {
		padding-top: 0.25rem;
	}

	:global(.task-modal__description-editor .markdown-editor__surface),
	:global(.task-modal__description-editor .markdown-editor__prosemirror) {
		min-height: 7rem;
	}
</style>
