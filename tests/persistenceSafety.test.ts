import { describe, expect, it } from 'vitest';
import type PocketBase from 'pocketbase';
import { getKanbanFingerprint, getProjectPagesFingerprint } from '../src/lib/kainbu/fingerprint';
import { isProposalStaleForProject } from '../src/lib/kainbu/aiProposals';
import { deriveBoardMutations, syncBoardWithPb } from '../src/lib/kainbu/boardSyncCore';
import type { Project } from '../src/lib/kainbu/types';

const task = (id: string, title = id) => ({ id, title, description: '', tags: [] });
const project = (kanbanData: Project['kanbanData']): Project => ({
	id: 'project-1',
	name: 'Project',
	ownerUserId: 'user-1',
	accessRole: 'owner',
	members: [],
	boards: [],
	pages: [],
	activeBoardId: 'board-1',
	activePageId: '',
	kanbanData,
	scratchpadData: { activePadId: '', pads: [] },
	scratchpadRev: 0,
	viewerLastOpenedAt: 0,
	backgroundTheme: null,
	aiSessions: [],
	activeAiSessionId: '',
	chatHistory: [],
	invites: [],
	createdAt: 0,
	updatedAt: 0
});

const fakePb = (error: unknown) => {
	const requests: unknown[] = [];
	return {
		requests,
		send: async (...args: unknown[]) => {
			requests.push(args);
			throw error;
		}
	} as unknown as PocketBase & { requests: unknown[] };
};

describe('persistence safety regressions', () => {
	it('rejects a proposal after the board changes since proposal generation', () => {
		const original = [{ id: 'column-1', title: 'Todo', tasks: [task('task-1')] }];
		const changed = [{ id: 'column-1', title: 'Todo', tasks: [task('task-1', 'edited')] }];
		const proposal = {
			id: 'proposal-1',
			target: 'kanban' as const,
			summary: 'change',
			scope: 'board' as const,
			editCallCount: 1,
			ops: [],
			proposalSafety: {
				outOfScope: false,
				touchedTaskIds: [],
				touchedColumnIds: [],
				moveCount: 0,
				deleteCount: 0,
				reorderCount: 0
			},
			originalKanbanData: original,
			preview: { kanbanData: changed },
			baseRevision: 0,
			baseFingerprint: getKanbanFingerprint(original)
		};
		expect(isProposalStaleForProject(proposal, project(changed))).toBe(true);
	});

	it('allows a proposal that creates a new page when the page set is unchanged', () => {
		const currentPages: Project['pages'] = [];
		const proposal = {
			id: 'proposal-page-1',
			target: 'scratchpad' as const,
			summary: 'new page',
			scope: 'scratchpad' as const,
			editCallCount: 1,
			ops: [],
			proposalSafety: {
				outOfScope: false,
				touchedTaskIds: [],
				touchedColumnIds: [],
				moveCount: 0,
				deleteCount: 0,
				reorderCount: 0
			},
			preview: {
				scratchpadState: {
					activePadId: 'new-page',
					pads: [{ id: 'new-page', name: 'New page', content: 'Hello' }]
				}
			},
			baseRevision: 0,
			baseFingerprint: getProjectPagesFingerprint(currentPages),
			padId: 'new-page'
		};
		expect(isProposalStaleForProject(proposal, project([]))).toBe(false);
	});

	it('soft-deletes tasks belonging to a deleted column before deleting the column', () => {
		const previous = [{ id: 'column-1', title: 'Todo', tasks: [task('task-1')] }];
		const mutations = deriveBoardMutations('project-1', 'board-1', previous, []);
		expect(mutations.deleteColumns.map((row) => row.id)).toEqual(['column-1']);
		expect(mutations.deleteTasks).toHaveLength(1);
		expect(mutations.deleteTasks[0]).toMatchObject({
			id: 'task-1',
			column_id: 'column-1',
			title: 'task-1'
		});
	});

	it('does not turn an update failure into a create attempt', async () => {
		const pb = fakePb(new Error('permission denied'));
		await expect(
			syncBoardWithPb(
				pb,
				'project-1',
				'board-1',
				[],
				[{ id: 'column-1', title: 'Todo', tasks: [] }]
			)
		).rejects.toThrow('permission denied');
		expect(pb.requests).toHaveLength(1);
	});

	it('propagates an existing child update failure without creating a duplicate', async () => {
		const pb = fakePb(new Error('validation failed'));
		await expect(
			syncBoardWithPb(
				pb,
				'project-1',
				'board-1',
				[],
				[{ id: 'column-1', title: 'Todo', tasks: [] }]
			)
		).rejects.toThrow('validation failed');
		expect(pb.requests).toHaveLength(1);
	});
});
