import { describe, expect, it } from 'vitest';
import {
	collectStagedProposalsFromHistory,
	clearStagedProposalsForTargets,
	removeStagedProposalFromHistory
} from '../src/lib/kainbu/aiProposals';
import type { AiKanbanProposal, ChatMessage } from '../src/lib/kainbu/types';

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

		expect(collectStagedProposalsFromHistory(history).map((proposal) => proposal.id)).toEqual(['p2']);
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
});
