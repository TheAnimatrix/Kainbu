import type { KanbanData, ScratchpadData, ScratchpadPad } from '../src/lib/kainbu/types.js';

const byteToHex = Array.from({ length: 256 }, (_, index) => index.toString(16).padStart(2, '0'));
const SCRATCHPAD_STORAGE_PREFIX = '__KAINBU_SCRATCHPADS_V1__';
const DEFAULT_PAD_NAME = 'Pad 1';

export const DEFAULT_COLUMN_WIDTH = 268;
const MIN_COLUMN_WIDTH = 220;
const MAX_COLUMN_WIDTH = 420;

const formatUuidFromBytes = (bytes: Uint8Array) => {
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;

	return [
		byteToHex[bytes[0]] +
			byteToHex[bytes[1]] +
			byteToHex[bytes[2]] +
			byteToHex[bytes[3]],
		byteToHex[bytes[4]] + byteToHex[bytes[5]],
		byteToHex[bytes[6]] + byteToHex[bytes[7]],
		byteToHex[bytes[8]] + byteToHex[bytes[9]],
		byteToHex[bytes[10]] +
			byteToHex[bytes[11]] +
			byteToHex[bytes[12]] +
			byteToHex[bytes[13]] +
			byteToHex[bytes[14]] +
			byteToHex[bytes[15]]
	].join('-');
};

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const normalizePadName = (value: unknown, index: number) =>
	typeof value === 'string' && value.trim() ? value.trim() : `Pad ${index}`;

const normalizePadContent = (value: unknown) => (typeof value === 'string' ? value : '');

export const createId = () => {
	const cryptoApi = globalThis.crypto;

	if (cryptoApi?.randomUUID) {
		return cryptoApi.randomUUID();
	}

	if (cryptoApi?.getRandomValues) {
		return formatUuidFromBytes(cryptoApi.getRandomValues(new Uint8Array(16)));
	}

	return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const clampColumnWidth = (value: number) =>
	Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, Math.round(value)));

const normalizeScratchpadPad = (value: unknown, index: number): ScratchpadPad | null => {
	if (!isObject(value)) {
		return null;
	}

	return {
		id: typeof value.id === 'string' && value.id.trim() ? value.id : createId(),
		name: normalizePadName(value.name, index + 1),
		content: normalizePadContent(value.content)
	};
};

export const createScratchpadPad = (name: string, content = ''): ScratchpadPad => ({
	id: createId(),
	name: name.trim() || DEFAULT_PAD_NAME,
	content
});

const createScratchpadData = (content = '', name = DEFAULT_PAD_NAME): ScratchpadData => {
	const pad = createScratchpadPad(name, content);

	return {
		activePadId: pad.id,
		pads: [pad]
	};
};

const normalizeScratchpadState = (
	value: Record<string, unknown>,
	fallbackContent: string
): ScratchpadData => {
	const pads = Array.isArray(value.pads)
		? value.pads.flatMap((pad, index) => {
				const normalizedPad = normalizeScratchpadPad(pad, index);
				return normalizedPad ? [normalizedPad] : [];
			})
		: [];

	if (!pads.length) {
		return createScratchpadData(fallbackContent);
	}

	return {
		activePadId:
			typeof value.activePadId === 'string' && pads.some((pad) => pad.id === value.activePadId)
				? value.activePadId
				: pads[0].id,
		pads
	};
};

export const normalizeScratchpadData = (value: unknown, fallbackContent = ''): ScratchpadData => {
	if (typeof value === 'string') {
		if (value.startsWith(SCRATCHPAD_STORAGE_PREFIX)) {
			try {
				const parsed = JSON.parse(value.slice(SCRATCHPAD_STORAGE_PREFIX.length)) as unknown;
				if (isObject(parsed)) {
					return normalizeScratchpadState(parsed, fallbackContent);
				}
			} catch {
				return createScratchpadData(
					fallbackContent || value.slice(SCRATCHPAD_STORAGE_PREFIX.length)
				);
			}
		}

		return createScratchpadData(value);
	}

	if (isObject(value)) {
		return normalizeScratchpadState(value, fallbackContent);
	}

	return createScratchpadData(fallbackContent);
};

export const getScratchpadPad = (value: ScratchpadData, padId: string) =>
	value.pads.find((pad) => pad.id === padId);

export const getActiveScratchpadPad = (value: ScratchpadData): ScratchpadPad =>
	getScratchpadPad(value, value.activePadId) ||
	value.pads[0] ||
	createScratchpadPad(DEFAULT_PAD_NAME);

export const setActiveScratchpadPad = (value: ScratchpadData, padId: string): ScratchpadData =>
	getScratchpadPad(value, padId)
		? {
				...value,
				activePadId: padId
			}
		: value;

export const updateScratchpadPadContent = (
	value: ScratchpadData,
	padId: string,
	content: string
): ScratchpadData => ({
	...value,
	pads: value.pads.map((pad) => (pad.id === padId ? { ...pad, content } : pad))
});

export const getNextScratchpadPadName = (value: ScratchpadData) => {
	const existingNumbers = value.pads
		.map((pad) => /^Pad (\d+)$/i.exec(pad.name)?.[1])
		.flatMap((match) => (match ? [Number(match)] : []));

	const nextNumber = existingNumbers.length
		? Math.max(...existingNumbers) + 1
		: value.pads.length + 1;

	return `Pad ${nextNumber}`;
};

export const deleteScratchpadPad = (value: ScratchpadData, padId: string): ScratchpadData => {
	if (value.pads.length <= 1) {
		return value;
	}

	const deletedPadIndex = value.pads.findIndex((pad) => pad.id === padId);
	if (deletedPadIndex === -1) {
		return value;
	}

	const pads = value.pads.filter((pad) => pad.id !== padId);
	const fallbackPad = pads[Math.max(0, deletedPadIndex - 1)] || pads[0];

	return {
		activePadId: value.activePadId === padId ? fallbackPad.id : value.activePadId,
		pads
	};
};

const canonicalizeKanbanData = (kanbanData: KanbanData) =>
	kanbanData.map((column) => ({
		id: column.id,
		title: column.title,
		color: column.color || null,
		width: column.width ?? DEFAULT_COLUMN_WIDTH,
		tasks: (column.tasks || []).map((task) => ({
			id: task.id,
			title: task.title,
			description: task.description || '',
			color: task.color || null,
			tags: (task.tags || []).map((tag) => ({
				id: tag.id,
				label: tag.label,
				color: tag.color || null
			})),
			hasCheckbox: Boolean(task.hasCheckbox),
			checked: Boolean(task.checked),
			completedAt: task.completedAt ?? null,
			countdownAt: task.countdownAt ?? null,
			alarmAt: task.alarmAt ?? null,
			assignedTo: task.assignedTo || null
		}))
	}));

export const getKanbanFingerprint = (kanbanData: KanbanData) =>
	JSON.stringify(canonicalizeKanbanData(kanbanData));

export const getScratchpadFingerprint = (scratchpadData: ScratchpadData) =>
	JSON.stringify({
		activePadId: scratchpadData.activePadId,
		pads: normalizeScratchpadData(scratchpadData).pads.map((pad) => ({
			id: pad.id,
			name: pad.name,
			content: pad.content
		}))
	});
