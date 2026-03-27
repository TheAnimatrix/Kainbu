import { createId } from '$lib/kainbu/id';
import type { ScratchpadData, ScratchpadPad } from '$lib/kainbu/types';

const SCRATCHPAD_STORAGE_PREFIX = '__KAINBU_SCRATCHPADS_V1__';
const DEFAULT_PAD_NAME = 'Pad 1';

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const normalizePadName = (value: unknown, index: number) =>
	typeof value === 'string' && value.trim() ? value.trim() : `Pad ${index}`;

const normalizePadContent = (value: unknown) => (typeof value === 'string' ? value : '');

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

export const createScratchpadPad = (name: string, content = ''): ScratchpadPad => ({
	id: createId(),
	name: name.trim() || DEFAULT_PAD_NAME,
	content
});

export const createScratchpadData = (content = '', name = DEFAULT_PAD_NAME): ScratchpadData => {
	const pad = createScratchpadPad(name, content);

	return {
		activePadId: pad.id,
		pads: [pad]
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

export const serializeScratchpadData = (value: ScratchpadData) => {
	const normalized = normalizeScratchpadData(value);

	return `${SCRATCHPAD_STORAGE_PREFIX}${JSON.stringify({
		activePadId: normalized.activePadId,
		pads: normalized.pads
	})}`;
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

export const addScratchpadPad = (value: ScratchpadData, content = ''): ScratchpadData => {
	const pad = createScratchpadPad(getNextScratchpadPadName(value), content);

	return {
		activePadId: pad.id,
		pads: [...value.pads, pad]
	};
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
