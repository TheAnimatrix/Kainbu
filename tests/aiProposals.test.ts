import { describe, expect, it } from 'vitest';
import {
	canResumeAppliedProposalUndo,
	collectAppliedProposalChangesFromHistory,
	collectStagedProposalsFromHistory,
	clearStagedProposalsForTargets,
	isAppliedProposalChangeCurrent,
	removeStagedProposalFromHistory,
	recoverInterruptedScratchpadUndosInHistory,
	toPendingProposals,
	updateAppliedProposalChangeInHistory
} from '../src/lib/kainbu/aiProposals';
import { getKanbanFingerprint, getProjectPagesFingerprint } from '../src/lib/kainbu/fingerprint';
import { normalizeChatHistory } from '../src/lib/kainbu/chatNormalization';
import type {
	AiKanbanProposal,
	AppliedProposalChange,
	ChatMessage,
	Project
} from '../src/lib/kainbu/types';

const kanbanProposal = (id: string): AiKanbanProposal => ({
	id,
	target: 'kanban',
	summary: 'Move tasks',
	scope: 'board',
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
	originalKanbanData: [],
	preview: { kanbanData: [] },
	baseRevision: 0,
	baseFingerprint: 'fp-1'
});

describe('aiProposals history helpers', () => {
	it('keeps the latest staged proposal per target', () => {
		const history: ChatMessage[] = [
			{
				id: 'm1',
				role: 'assistant',
				text: 'First',
				timestamp: 1,
				stagedProposals: [kanbanProposal('p1')]
			},
			{
				id: 'm2',
				role: 'assistant',
				text: 'Second',
				timestamp: 2,
				stagedProposals: [kanbanProposal('p2')]
			}
		];

		expect(collectStagedProposalsFromHistory(history).map((proposal) => proposal.id)).toEqual([
			'p2'
		]);
	});

	it('clears superseded staged proposals from older messages', () => {
		const history: ChatMessage[] = [
			{
				id: 'm1',
				role: 'assistant',
				text: 'First',
				timestamp: 1,
				stagedProposals: [kanbanProposal('p1')]
			}
		];

		const next = clearStagedProposalsForTargets(history, ['kanban']);
		expect(next[0]?.stagedProposals).toBeUndefined();
	});

	it('removes a staged proposal by id', () => {
		const history: ChatMessage[] = [
			{
				id: 'm1',
				role: 'assistant',
				text: 'First',
				timestamp: 1,
				stagedProposals: [kanbanProposal('p1')]
			}
		];

		const next = removeStagedProposalFromHistory(history, 'p1');
		expect(next[0]?.stagedProposals).toBeUndefined();
	});

	it('persists and updates applied changes on their originating message', () => {
		const after = [{ id: 'todo', title: 'Todo', width: 268, tasks: [] }];
		const change: AppliedProposalChange = {
			id: 'change-1',
			proposalId: 'p1',
			projectId: 'project-1',
			sessionId: 'session-1',
			messageId: 'm1',
			target: 'kanban',
			boardId: 'board-1',
			summary: 'Add Todo',
			appliedAt: 1,
			status: 'applied',
			beforeFingerprint: getKanbanFingerprint([]),
			afterFingerprint: getKanbanFingerprint(after),
			before: { kanbanData: [] },
			after: { kanbanData: after }
		};
		const history: ChatMessage[] = [
			{ id: 'm1', role: 'assistant', text: '', timestamp: 1, appliedProposalChanges: [change] }
		];

		expect(collectAppliedProposalChangesFromHistory(history)).toEqual([change]);
		expect(
			collectAppliedProposalChangesFromHistory(
				normalizeChatHistory(JSON.parse(JSON.stringify(history)))
			)
		).toEqual([change]);
		expect(
			collectAppliedProposalChangesFromHistory(
				updateAppliedProposalChangeInHistory(history, change.id, (current) => ({
					...current,
					status: 'undone'
				}))
			)[0]?.status
		).toBe('undone');
	});

	it('only allows undo while the edited target still matches the applied snapshot', () => {
		const after = [{ id: 'todo', title: 'Todo', width: 268, tasks: [] }];
		const change: AppliedProposalChange = {
			id: 'change-1',
			proposalId: 'p1',
			projectId: 'project-1',
			sessionId: 'session-1',
			messageId: 'm1',
			target: 'kanban',
			boardId: 'board-1',
			summary: 'Add Todo',
			appliedAt: 1,
			status: 'applied',
			beforeFingerprint: getKanbanFingerprint([]),
			afterFingerprint: getKanbanFingerprint(after),
			before: { kanbanData: [] },
			after: { kanbanData: after }
		};
		const project = {
			kanbanData: after,
			boards: [{ id: 'board-1', kanbanData: after }],
			pages: []
		} as unknown as Project;

		expect(isAppliedProposalChangeCurrent(change, project)).toBe(true);
		expect(
			isAppliedProposalChangeCurrent(change, {
				...project,
				boards: [{ id: 'board-1', kanbanData: [{ ...after[0], title: 'Changed later' }] }]
			} as unknown as Project)
		).toBe(false);
	});

	it('guards page undo with the whole page-set fingerprint', () => {
		const pages = [{ id: 'page-1', name: 'Notes', content: 'After' }];
		const change = {
			id: 'change-2',
			proposalId: 'p2',
			projectId: 'project-1',
			sessionId: 'session-1',
			messageId: 'm2',
			target: 'scratchpad' as const,
			summary: 'Edit Notes',
			appliedAt: 1,
			status: 'applied' as const,
			beforeFingerprint: getProjectPagesFingerprint([
				{ id: 'page-1', name: 'Notes', content: 'Before' }
			]),
			afterFingerprint: getProjectPagesFingerprint(pages),
			before: { pages: [], activePageId: 'page-1' },
			after: { pages: [], activePageId: 'page-1' }
		};
		const project = { kanbanData: [], pages } as unknown as Project;

		expect(isAppliedProposalChangeCurrent(change, project)).toBe(true);
		expect(
			isAppliedProposalChangeCurrent(change, {
				...project,
				pages: [...pages, { id: 'page-2', name: 'Later', content: '' }]
			} as unknown as Project)
		).toBe(false);
	});

	it('keeps a proposal bound to its original board after navigation and reload', () => {
		const originalBoard = [{ id: 'todo', title: 'Todo', width: 268, tasks: [] }];
		const otherBoard = [{ id: 'doing', title: 'Doing', width: 268, tasks: [] }];
		const proposal = {
			...kanbanProposal('proposal-board-a'),
			boardId: 'board-a',
			baseFingerprint: getKanbanFingerprint(originalBoard)
		};
		const history = normalizeChatHistory([
			{
				id: 'message-1',
				role: 'assistant',
				text: '',
				timestamp: 1,
				stagedProposals: [proposal]
			}
		]);
		const project = {
			id: 'project-1',
			activeBoardId: 'board-b',
			kanbanData: otherBoard,
			boards: [
				{ id: 'board-a', kanbanData: originalBoard },
				{ id: 'board-b', kanbanData: otherBoard }
			],
			pages: []
		} as unknown as Project;
		const restoredProposal = collectStagedProposalsFromHistory(history)[0];

		expect(restoredProposal).toMatchObject({ boardId: 'board-a' });
		expect(toPendingProposals(project, [restoredProposal])[0]).toMatchObject({
			boardId: 'board-a',
			stale: false
		});
	});

	it('resumes a partial page undo only from its exact checkpoint', () => {
		const checkpointPages = [{ id: 'page-1', name: 'Notes', content: 'Restored' }];
		const change: AppliedProposalChange = {
			id: 'change-page',
			proposalId: 'proposal-page',
			projectId: 'project-1',
			sessionId: 'session-1',
			messageId: 'message-1',
			target: 'scratchpad',
			summary: 'Edit Notes',
			appliedAt: 1,
			status: 'applied',
			beforeFingerprint: getProjectPagesFingerprint(checkpointPages),
			afterFingerprint: getProjectPagesFingerprint([
				{ id: 'page-1', name: 'Notes', content: 'Changed' }
			]),
			undoFingerprint: getProjectPagesFingerprint(checkpointPages),
			before: { pages: [], activePageId: 'page-1' },
			after: { pages: [], activePageId: 'page-1' }
		};
		const project = { pages: checkpointPages, boards: [] } as unknown as Project;

		expect(canResumeAppliedProposalUndo(change, project)).toBe(true);
		expect(
			canResumeAppliedProposalUndo(change, {
				...project,
				pages: [{ ...checkpointPages[0], content: 'Later user edit' }]
			} as unknown as Project)
		).toBe(false);
	});

	it('recovers an interrupted page undo as a retryable action after reload', () => {
		const change = {
			id: 'change-page',
			proposalId: 'proposal-page',
			projectId: 'project-1',
			sessionId: 'session-1',
			messageId: 'message-1',
			target: 'scratchpad' as const,
			summary: 'Edit Notes',
			appliedAt: 1,
			status: 'undoing' as const,
			beforeFingerprint: 'before',
			afterFingerprint: 'after',
			undoFingerprint: 'checkpoint',
			before: { pages: [], activePageId: 'page-1' },
			after: { pages: [], activePageId: 'page-1' }
		};
		const recovered = recoverInterruptedScratchpadUndosInHistory([
			{
				id: 'message-1',
				role: 'assistant',
				text: '',
				timestamp: 1,
				appliedProposalChanges: [change]
			}
		]);

		expect(recovered[0]?.appliedProposalChanges?.[0]).toMatchObject({
			status: 'applied',
			undoFingerprint: 'checkpoint',
			error: expect.stringContaining('Retry')
		});
	});
});
