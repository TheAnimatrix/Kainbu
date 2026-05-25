import { describe, expect, it } from 'vitest';
import {
	buildBoardClientIdByPbId,
	resolveBoardClientIdForRecord
} from '../server/workspace-ai/sync';

describe('workspace AI board id resolution', () => {
	it('maps PocketBase board relation ids to client ids', () => {
		const boardClientIdByPbId = buildBoardClientIdByPbId([
			{ id: 'pb-board-1', client_id: 'client-board-1' },
			{ id: 'pb-board-2', client_id: 'client-board-2' }
		]);

		expect(
			resolveBoardClientIdForRecord({ board: 'pb-board-1' }, boardClientIdByPbId)
		).toBe('client-board-1');
		expect(
			resolveBoardClientIdForRecord(
				{ board: { id: 'pb-board-2', collectionId: 'project_boards' } },
				boardClientIdByPbId
			)
		).toBe('client-board-2');
		expect(
			resolveBoardClientIdForRecord({ board: 'unknown' }, boardClientIdByPbId)
		).toBeNull();
	});

	it('filters columns to active board using client ids', () => {
		const boardClientIdByPbId = buildBoardClientIdByPbId([
			{ id: 'pb-a', client_id: 'board-a' },
			{ id: 'pb-b', client_id: 'board-b' }
		]);

		const columns = [
			{ board: 'pb-a', title: 'Col 1' },
			{ board: 'pb-b', title: 'Col 2' },
			{ board: 'pb-a', title: 'Col 3' }
		].map((record) => ({
			board_id: resolveBoardClientIdForRecord(record, boardClientIdByPbId),
			title: record.title
		}));

		const activeBoardId = 'board-a';
		const filtered = columns.filter(
			(column) => (column.board_id || activeBoardId) === activeBoardId
		);

		expect(filtered).toHaveLength(2);
		expect(filtered.map((column) => column.title)).toEqual(['Col 1', 'Col 3']);
	});
});
