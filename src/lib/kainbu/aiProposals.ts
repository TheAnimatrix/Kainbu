import { getKanbanFingerprint, getProjectPagesFingerprint } from '$lib/kainbu/fingerprint';
import type { AiProposal, ChatMessage, PendingProposal, Project, ProposalTarget } from '$lib/kainbu/types';

export const isProposalStaleForProject = (proposal: AiProposal, project: Project): boolean =>
	proposal.target === 'kanban'
		? getKanbanFingerprint(project.kanbanData) !== proposal.baseFingerprint
		: getProjectPagesFingerprint(project.pages) !== proposal.baseFingerprint;

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

export const toPendingProposals = (project: Project, proposals: AiProposal[]): PendingProposal[] =>
	proposals.map((proposal) =>
		proposal.target === 'kanban'
			? {
					...proposal,
					projectId: project.id,
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
