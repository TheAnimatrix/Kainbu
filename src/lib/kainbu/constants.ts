import { createId } from '$lib/kainbu/id';
import { DEFAULT_AI_MODEL_ID } from '$lib/kainbu/models';
import { DEFAULT_BACKGROUND_THEME } from '$lib/kainbu/backgrounds';
import { createScratchpadData } from '$lib/kainbu/scratchpad';
import type { KanbanData, Project, UserSettings } from '$lib/kainbu/types';

export const BRAND_NAME = 'Kainbu';
export const BRAND_KATAKANA = 'カインブ';

export const BOARD_LIST_TASKS_DEFAULT_LIMIT = 15;
export const BOARD_LIST_TASKS_MAX_LIMIT = 50;

export const TAG_COLORS = [
	{
		value: 'tone:red',
		swatchClass: 'border-red-400/35 bg-red-400 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]'
	},
	{
		value: 'tone:orange',
		swatchClass:
			'border-orange-400/35 bg-orange-400 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]'
	},
	{
		value: 'tone:amber',
		swatchClass: 'border-amber-400/35 bg-amber-400 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]'
	},
	{
		value: 'tone:green',
		swatchClass: 'border-green-400/35 bg-green-400 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]'
	},
	{
		value: 'tone:emerald',
		swatchClass:
			'border-emerald-400/35 bg-emerald-400 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]'
	},
	{
		value: 'tone:teal',
		swatchClass: 'border-teal-400/35 bg-teal-400 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]'
	},
	{
		value: 'tone:cyan',
		swatchClass: 'border-cyan-400/35 bg-cyan-400 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]'
	},
	{
		value: 'tone:blue',
		swatchClass: 'border-blue-400/35 bg-blue-400 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]'
	},
	{
		value: 'tone:indigo',
		swatchClass:
			'border-indigo-400/35 bg-indigo-400 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]'
	},
	{
		value: 'tone:violet',
		swatchClass:
			'border-violet-400/35 bg-violet-400 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]'
	},
	{
		value: 'tone:purple',
		swatchClass:
			'border-purple-400/35 bg-purple-400 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]'
	},
	{
		value: 'tone:fuchsia',
		swatchClass:
			'border-fuchsia-400/35 bg-fuchsia-400 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]'
	},
	{
		value: 'tone:pink',
		swatchClass: 'border-pink-400/35 bg-pink-400 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]'
	},
	{
		value: 'tone:rose',
		swatchClass: 'border-rose-400/35 bg-rose-400 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]'
	}
] as const;

export const SURFACE_TONE_OPTIONS = [
	{
		value: '',
		label: 'Default',
		swatchClass:
			'border-app-border bg-app-surface shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset]'
	},
	...TAG_COLORS.map((color) => ({
		value: color.value,
		label: color.value.replace('tone:', '').replace(/^./, (char) => char.toUpperCase()),
		swatchClass: color.swatchClass
	}))
] as const;

export const COLUMN_DOT_COLORS = ['bg-orange-400', 'bg-blue-400', 'bg-cyan-400', 'bg-emerald-400'];
export const DEFAULT_COLUMN_WIDTH = 268;
export const MIN_COLUMN_WIDTH = 220;
export const MAX_COLUMN_WIDTH = 420;

export const clampColumnWidth = (value: number) =>
	Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, Math.round(value)));

export const DEFAULT_SETTINGS: UserSettings = {
	defaultShowCheckbox: true,
	preferredAiModelId: DEFAULT_AI_MODEL_ID,
	backgroundTheme: DEFAULT_BACKGROUND_THEME
};

export const INITIAL_KANBAN: KanbanData = [
	{
		id: 'todo',
		title: 'To Do',
		width: DEFAULT_COLUMN_WIDTH,
		tasks: [
			{
				id: 't1',
				title: 'Explore Kainbu capabilities',
				description: 'Try asking the assistant to **rewrite** this description or add new tasks.',
				tags: [
					{
						id: 'tag1',
						label: 'Feature',
						color: 'tone:blue'
					}
				],
				hasCheckbox: true,
				checked: false
			},
			{
				id: 't2',
				title: 'Draft project plan',
				description: '- Define scope\n- Set milestones\n- Assign resources',
				tags: [
					{
						id: 'tag2',
						label: 'Urgent',
						color: 'tone:red'
					}
				],
				hasCheckbox: true,
				checked: false
			}
		]
	},
	{
		id: 'doing',
		title: 'In Progress',
		width: DEFAULT_COLUMN_WIDTH,
		tasks: []
	},
	{
		id: 'done',
		title: 'Done',
		width: DEFAULT_COLUMN_WIDTH,
		tasks: []
	}
];

export const INITIAL_SCRATCHPAD = `# Welcome to Kainbu | カインブ

This is a scratchpad for your notes.
The assistant can read this and help you edit it.

- [ ] Jot down ideas
- [ ] Ask AI to summarize
`;

export const DEFAULT_CHAT_HISTORY = [
	{
		id: 'seed-message',
		role: 'assistant' as const,
		text: 'Hello! I am your Kainbu assistant. I can help you manage your Kanban board and notes. Try asking me to add a task, rewrite your notes, or summarize what is already here.',
		timestamp: Date.now()
	}
];

export const DEFAULT_AI_SESSION_TITLE = 'New chat';

export const DESKTOP_CHAT_WIDTH = 25;
export const DESKTOP_CHAT_MIN = 20;
export const DESKTOP_CHAT_MAX = 40;

export const EMPTY_PROJECT = (userId: string, name = 'New Project'): Project => {
	const now = Date.now();
	const initialAiSessionId = createId();
	const initialChatHistory = structuredClone(DEFAULT_CHAT_HISTORY);
	const initialAiSession = {
		id: initialAiSessionId,
		projectId: '',
		title: DEFAULT_AI_SESSION_TITLE,
		modelId: DEFAULT_AI_MODEL_ID,
		history: initialChatHistory,
		createdAt: now,
		updatedAt: now,
		lastMessageAt: initialChatHistory.at(-1)?.timestamp || now
	};

	return {
		id: createId(),
		ownerUserId: userId,
		accessRole: 'owner',
		name,
		backgroundTheme: null,
		boards: [
			{
				id: createId(),
				projectId: '',
				name: 'Board',
				position: 0,
				kanbanData: structuredClone(INITIAL_KANBAN),
				createdAt: now,
				updatedAt: now
			}
		],
		pages: [
			{
				id: createId(),
				projectId: '',
				name: 'Notes',
				content: INITIAL_SCRATCHPAD,
				position: 0,
				createdAt: now,
				updatedAt: now
			}
		],
		activeBoardId: '',
		activePageId: '',
		kanbanData: structuredClone(INITIAL_KANBAN),
		scratchpadData: createScratchpadData(INITIAL_SCRATCHPAD, 'Notes'),
		scratchpadRev: 0,
		aiSessions: [initialAiSession],
		activeAiSessionId: initialAiSessionId,
		chatHistory: structuredClone(initialAiSession.history),
		members: [],
		invites: [],
		createdAt: now,
		updatedAt: now,
		viewerLastOpenedAt: now
	};
};
