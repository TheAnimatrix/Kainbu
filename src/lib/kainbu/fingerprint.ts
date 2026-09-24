import { normalizeScratchpadData } from '$lib/kainbu/scratchpad';
import type { ScratchpadData } from '$lib/kainbu/types';

export { canonicalizeKanbanData, getKanbanFingerprint } from './kanbanFingerprint';

export const canonicalizeScratchpadData = (scratchpadData: ScratchpadData) => {
	const normalized = normalizeScratchpadData(scratchpadData);

	return {
		activePadId: normalized.activePadId,
		pads: normalized.pads.map((pad) => ({
			id: pad.id,
			name: pad.name,
			content: pad.content
		}))
	};
};

export const getScratchpadFingerprint = (scratchpadData: ScratchpadData) =>
	JSON.stringify(canonicalizeScratchpadData(scratchpadData));

export const getProjectPagesFingerprint = (
	pages: Array<{ id: string; name: string; content: string }>
) =>
	JSON.stringify(
		[...pages]
			.sort((left, right) => left.id.localeCompare(right.id))
			.map((page) => ({
				id: page.id,
				name: page.name,
				content: page.content
			}))
	);
