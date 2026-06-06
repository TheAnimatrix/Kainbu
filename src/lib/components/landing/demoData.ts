import type { KanbanData } from '$lib/kainbu/types';

/**
 * Fictional workspace used only for the marketing landing scenes.
 * Nothing here references real boards, projects, or notes - it is a believable
 * product team ("Tend", a habit app) so the previews look real without leaking data.
 */

export type DemoProject = {
	id: string;
	name: string;
	active?: boolean;
};

export const DEMO_PROJECTS: DemoProject[] = [
	{ id: 'tend-mobile', name: 'Tend Mobile', active: true },
	{ id: 'website', name: 'Website' },
	{ id: 'roadmap', name: 'Roadmap' },
	{ id: 'design-system', name: 'Design system' }
];

export const DEMO_BOARD: KanbanData = [
	{
		id: 'backlog',
		title: 'Backlog',
		width: 248,
		tasks: [
			{
				id: 'offline-sync',
				title: 'Offline sync for streak data',
				description: 'Queue writes locally, reconcile on reconnect.',
				tags: [{ id: 't-sync', label: 'Sync', color: 'tone:blue' }],
				hasCheckbox: true,
				checked: false
			},
			{
				id: 'localize',
				title: 'Localize onboarding (de, fr)',
				description: '',
				tags: [{ id: 't-i18n', label: 'i18n', color: 'tone:violet' }],
				hasCheckbox: true,
				checked: false
			}
		]
	},
	{
		id: 'in-progress',
		title: 'In Progress',
		width: 248,
		tasks: [
			{
				id: 'reminders',
				title: 'Reminder notifications v2',
				description: 'Quiet hours, retries, per-habit cadence.',
				tags: [
					{ id: 't-mobile', label: 'Mobile', color: 'tone:teal' },
					{ id: 't-p1', label: 'P1', color: 'tone:red' }
				],
				hasCheckbox: true,
				checked: false
			},
			{
				id: 'empty-states',
				title: 'Empty-state illustrations',
				description: '',
				tags: [{ id: 't-design', label: 'Design', color: 'tone:amber' }],
				hasCheckbox: true,
				checked: false
			}
		]
	},
	{
		id: 'done',
		title: 'Done',
		width: 248,
		tasks: [
			{
				id: 'insights',
				title: 'Weekly insights digest',
				description: '',
				tags: [{ id: 't-growth', label: 'Growth', color: 'tone:emerald' }],
				hasCheckbox: true,
				checked: true
			}
		]
	}
];

/** A single linked component (3 cards) used by the linked-views scene. */
export type DemoLinkedCard = {
	id: string;
	title: string;
	column: string;
	tags: { id: string; label: string; color: string }[];
};

export const DEMO_LINK_GROUP: DemoLinkedCard[] = [
	{
		id: 'reminders',
		title: 'Reminder notifications v2',
		column: 'In Progress',
		tags: [
			{ id: 'l-mobile', label: 'Mobile', color: 'tone:teal' },
			{ id: 'l-p1', label: 'P1', color: 'tone:red' }
		]
	},
	{
		id: 'push-infra',
		title: 'Push delivery infra',
		column: 'Backlog',
		tags: [{ id: 'l-infra', label: 'Infra', color: 'tone:indigo' }]
	},
	{
		id: 'offline-sync',
		title: 'Offline sync for streak data',
		column: 'Backlog',
		tags: [{ id: 'l-sync', label: 'Sync', color: 'tone:blue' }]
	}
];

export type DemoChatMessage =
	| { id: string; role: 'assistant'; text: string }
	| { id: string; role: 'user'; text: string };

export const DEMO_CHAT: DemoChatMessage[] = [
	{
		id: 'm1',
		role: 'assistant',
		text: 'I can read this board and notes. Ask me to plan work, retag cards, or rewrite copy.'
	},
	{
		id: 'm2',
		role: 'user',
		text: "Break 'Reminder notifications v2' into subtasks and tag each."
	}
];

/** The staged change the assistant proposes - shown with accept / reject. */
export const DEMO_PROPOSAL = {
	summary: 'Add 3 subtasks to In Progress',
	tasks: [
		{ id: 'p1', title: 'Register APNs / FCM tokens', tag: { label: 'Mobile', color: 'tone:teal' } },
		{ id: 'p2', title: 'Quiet hours setting', tag: { label: 'UX', color: 'tone:purple' } },
		{ id: 'p3', title: 'Retry with backoff on failed sends', tag: { label: 'P1', color: 'tone:red' } }
	]
};

export const DEMO_NOTE = `# Reminder notifications v2

Per-habit cadence so a daily walk and a weekly review do not share one schedule.

## Open questions
- [x] Default to device timezone
- [ ] Quiet hours: per-user or per-habit?
- [ ] Cap retries at 3, then surface a banner

> Ship the cadence picker first. Quiet hours can follow in a point release.
`;

/** Theme ids surfaced in the themes scene (resolve via BACKGROUND_GRADIENT_OPTIONS). */
export const DEMO_THEME_IDS = [
	'lagoon-veil',
	'ember-haze',
	'forest-glow',
	'indigo-rain',
	'rose-fog',
	'deep-sea'
] as const;
