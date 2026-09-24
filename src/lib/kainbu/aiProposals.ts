import { getKanbanFingerprint, getProjectPagesFingerprint } from '$lib/kainbu/fingerprint';
import type {
	AiProposal,
	AppliedProposalChange,
	ChatMessage,
	PendingProposal,
	Project,
	ProposalTarget
} from '$lib/kainbu/types';

export const isProposalStaleForProject = (proposal: AiProposal, project: Project): boolean => {
	if (proposal.target !== 'kanban') {
		return getProjectPagesFingerprint(project.pages) !== proposal.baseFingerprint;
	}
	const boardData = proposal.boardId
		? project.boards.find((board) => board.id === proposal.boardId)?.kanbanData
		: project.kanbanData;
	return !boardData || getKanbanFingerprint(boardData) !== proposal.baseFingerprint;
};

export const collectStagedProposalsFromHistory = (history: ChatMessage[]): AiProposal[] => {
	const byTarget = new Map<ProposalTarget, AiProposal>();

	for (const message of history) {
		for (const proposal of message.stagedProposals || []) {
			byTarget.set(proposal.target, proposal);
		}
	}

	return [...byTarget.values()];
};

export const clearStagedProposalsForTargets = (
	history: ChatMessage[],
	targets: ProposalTarget[]
): ChatMessage[] => {
	if (!targets.length) return history;

	return history.map((message) => {
		if (!message.stagedProposals?.length) return message;
		const nextProposals = message.stagedProposals.filter(
			(proposal) => !targets.includes(proposal.target)
		);
		if (nextProposals.length === message.stagedProposals.length) return message;
		const { stagedProposals: _removed, ...rest } = message;
		return nextProposals.length ? { ...rest, stagedProposals: nextProposals } : rest;
	});
};

export const removeStagedProposalFromHistory = (
	history: ChatMessage[],
	proposalId: string
): ChatMessage[] =>
	history.map((message) => {
		if (!message.stagedProposals?.some((proposal) => proposal.id === proposalId)) {
			return message;
		}
		const nextProposals = message.stagedProposals.filter((proposal) => proposal.id !== proposalId);
		const { stagedProposals: _removed, ...rest } = message;
		return nextProposals.length ? { ...rest, stagedProposals: nextProposals } : rest;
	});

export const collectAppliedProposalChangesFromHistory = (
	history: ChatMessage[]
): AppliedProposalChange[] => history.flatMap((message) => message.appliedProposalChanges || []);

export const updateAppliedProposalChangeInHistory = (
	history: ChatMessage[],
	changeId: string,
	update: (change: AppliedProposalChange) => AppliedProposalChange
): ChatMessage[] =>
	history.map((message) => {
		if (!message.appliedProposalChanges?.some((change) => change.id === changeId)) return message;
		return {
			...message,
			appliedProposalChanges: message.appliedProposalChanges.map((change) =>
				change.id === changeId ? update(change) : change
			)
		};
	});

export const recoverInterruptedScratchpadUndosInHistory = (history: ChatMessage[]): ChatMessage[] =>
	history.map((message) => {
		if (
			!message.appliedProposalChanges?.some(
				(change) =>
					change.target === 'scratchpad' &&
					(change.status === 'undoing' || change.status === 'redoing')
			)
		) {
			return message;
		}
		return {
			...message,
			appliedProposalChanges: message.appliedProposalChanges.map((change) =>
				change.target === 'scratchpad' &&
				(change.status === 'undoing' || change.status === 'redoing')
					? {
							...change,
							status: change.status === 'undoing' ? 'applied' : 'undone',
							error: `${change.status === 'undoing' ? 'Undo' : 'Redo'} was interrupted. Retry to continue from the last completed step.`
						}
					: change
			)
		};
	});

export const isAppliedProposalChangeCurrent = (
	change: AppliedProposalChange,
	project: Project
): boolean =>
	getAppliedProposalChangeTargetFingerprint(change, project) === change.afterFingerprint;

export const getAppliedProposalChangeTargetFingerprint = (
	change: AppliedProposalChange,
	project: Project
): string =>
	change.target === 'kanban'
		? getKanbanFingerprint(
				project.boards.find((board) => board.id === change.boardId)?.kanbanData || []
			)
		: getProjectPagesFingerprint(project.pages);

export const canResumeAppliedProposalUndo = (
	change: AppliedProposalChange,
	project: Project
): boolean =>
	getAppliedProposalChangeTargetFingerprint(change, project) ===
	(change.undoFingerprint || change.afterFingerprint);

export const canResumeAppliedProposalRedo = (
	change: AppliedProposalChange,
	project: Project
): boolean =>
	getAppliedProposalChangeTargetFingerprint(change, project) ===
	(change.undoFingerprint || change.beforeFingerprint);

export const toPendingProposals = (project: Project, proposals: AiProposal[]): PendingProposal[] =>
	proposals.map((proposal) =>
		proposal.target === 'kanban'
			? {
					...proposal,
					projectId: project.id,
					boardId: proposal.boardId || project.activeBoardId,
					stale: isProposalStaleForProject(proposal, project),
					originalKanbanData: structuredClone(proposal.originalKanbanData)
				}
			: {
					...proposal,
					projectId: project.id,
					stale: isProposalStaleForProject(proposal, project),
					originalScratchpadState: structuredClone(project.scratchpadData)
				}
	);
