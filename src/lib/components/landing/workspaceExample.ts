import type {
	AppliedProposalChange,
	ChatMessage,
	KanbanData,
	ProjectAiSession
} from '$lib/kainbu/types';

// Synthetic editorial project: these fixtures never read or persist account data.
const timestamp = 1790164800000;
const writing = { id: 'writing', label: 'Writing', color: 'orange' };
const design = { id: 'design', label: 'Design', color: 'blue' };
export const board: KanbanData = [
	{
		id: 'todo',
		title: 'To do',
		width: 260,
		tasks: [
			{
				id: 'editor',
				title: 'A letter from the editor',
				description: 'A few words on paying closer attention.',
				tags: [writing]
			},
			{
				id: 'stock',
				title: 'Choose the paper stock',
				description: 'Uncoated. A little texture. Something worth keeping.',
				tags: [design]
			}
		]
	},
	{
		id: 'progress',
		title: 'In progress',
		width: 260,
		tasks: [
			{
				id: 'cover',
				title: 'Find the cover',
				description: 'One image that says everything.',
				tags: [design]
			},
			{ id: 'sequence', title: 'Sequence the photo essay', tags: [] }
		]
	},
	{
		id: 'done',
		title: 'Done',
		width: 260,
		tasks: [
			{ id: 'makers', title: 'Conversations with makers', tags: [writing], checked: true },
			{ id: 'walk', title: 'A walk through the old town', tags: [writing], checked: true }
		]
	}
];
const before = structuredClone(board);
before[1].tasks.push(...before[2].tasks.map((task) => ({ ...task, checked: false })));
before[2].tasks = [];
export const changes: AppliedProposalChange[] = [
	{
		id: 'example-change',
		proposalId: 'example-proposal',
		projectId: 'example-project',
		sessionId: 'example-session',
		messageId: 'example-response',
		target: 'kanban',
		boardId: 'example-board',
		summary: 'Moved 2 stories to Done',
		appliedAt: timestamp,
		status: 'applied',
		beforeFingerprint: 'example-before',
		afterFingerprint: 'example-after',
		before: { kanbanData: before },
		after: { kanbanData: board }
	}
];
export const history: ChatMessage[] = [
	{
		id: 'example-request',
		role: 'user',
		text: 'The makers interview and the old town story are ready for print. Move them to Done.',
		timestamp
	},
	{
		id: 'example-response',
		role: 'assistant',
		text: 'Both stories are in **Done**.\n\nThe cover and photo sequence are still in progress. The issue is coming together.',
		timestamp: timestamp + 1000,
		appliedProposalChanges: changes
	}
];
export const session: ProjectAiSession = {
	id: 'example-session',
	projectId: 'example-project',
	title: 'Getting ready for print',
	modelId: '',
	history,
	createdAt: timestamp,
	updatedAt: timestamp,
	lastMessageAt: timestamp
};
export const pageContent = `# An eye for the everyday

Fieldwork is an independent journal about people who make things, and the places that shape them.

## Issue 01 — Close to home

Start with what is nearby. The workshop down the street. The long way home. The details we usually walk past.

## Editorial notes

- Let the photographs breathe.
- Keep the writing personal, specific, and curious.
- Make something that feels good to hold.

## Before we go to print

The cover and photo sequence are still in progress. Both feature stories are ready. Choose the paper stock before the final colour proof.`;
