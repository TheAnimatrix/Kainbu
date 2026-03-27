import { getEnv, getRequiredEnv } from './env.js';
import { getAuthenticatedUserId } from './supabase.js';
import type {
	AiWorkspaceRequest,
	AiWorkspaceResponse,
	ChatAttachment,
	ChatMessage,
	ChatMode,
	KanbanData,
	Task,
	WorkspaceAction
} from '../src/lib/kainbu/types.js';

type Classification = {
	intent: 'chat' | 'edit';
	complexity: 'simple' | 'complex';
	includeKanban: boolean;
	includeScratchpad: boolean;
	useWebSearch: boolean;
};

type OpenRouterAnnotation = {
	type?: string;
	url_citation?: {
		title?: string;
		url?: string;
		content?: string;
		start_index?: number;
		end_index?: number;
	};
};

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const VALID_TAG_COLOR_VALUES = [
	'tone:red',
	'tone:orange',
	'tone:amber',
	'tone:green',
	'tone:emerald',
	'tone:teal',
	'tone:cyan',
	'tone:blue',
	'tone:indigo',
	'tone:violet',
	'tone:purple',
	'tone:fuchsia',
	'tone:pink',
	'tone:rose'
] as const;
const VALID_TAG_TONES = VALID_TAG_COLOR_VALUES.map((value) => value.replace('tone:', ''));
const TAG_COLOR_INSTRUCTIONS = `Every tag must include tag.color using exactly one of these values: ${VALID_TAG_COLOR_VALUES.join(', ')}. Preserve existing tag colors when possible. For new tags, choose the closest matching tone.`;
const SURFACE_COLOR_INSTRUCTIONS =
	'When using task.color or column.color, use the same tone:* values as tags, and preserve existing task and column colors unless the user explicitly asks to recolor them.';

const isValidTagColor = (value: string): value is (typeof VALID_TAG_COLOR_VALUES)[number] =>
	VALID_TAG_COLOR_VALUES.includes(value.toLowerCase() as (typeof VALID_TAG_COLOR_VALUES)[number]);

const normalizeToneValue = (value: string | undefined, fallback?: string) => {
	const normalizedValue = value?.trim().toLowerCase() || '';

	if (isValidTagColor(normalizedValue)) {
		return normalizedValue;
	}

	const matchedTone = VALID_TAG_TONES.find((tone) => normalizedValue.includes(tone));
	if (matchedTone) {
		return `tone:${matchedTone}`;
	}

	return fallback;
};

const buildExistingTagColorMap = (kanbanData: KanbanData) => {
	const existingTagColors = new Map<string, string>();

	for (const column of kanbanData) {
		for (const task of column.tasks) {
			for (const tag of task.tags || []) {
				const normalizedLabel = tag.label.trim().toLowerCase();
				const normalizedColor = tag.color.trim().toLowerCase();
				if (
					!normalizedLabel ||
					!isValidTagColor(normalizedColor) ||
					existingTagColors.has(normalizedLabel)
				) {
					continue;
				}

				existingTagColors.set(normalizedLabel, normalizedColor);
			}
		}
	}

	return existingTagColors;
};

const buildExistingColumnColorMap = (kanbanData: KanbanData) => {
	const existingColumnColors = new Map<string, string>();

	for (const column of kanbanData) {
		const normalizedColor = normalizeToneValue(column.color);
		if (normalizedColor) {
			existingColumnColors.set(column.id, normalizedColor);
		}
	}

	return existingColumnColors;
};

const buildExistingTaskColorMap = (kanbanData: KanbanData) => {
	const existingTaskColors = new Map<string, string>();

	for (const column of kanbanData) {
		for (const task of column.tasks) {
			const normalizedColor = normalizeToneValue(task.color);
			if (normalizedColor) {
				existingTaskColors.set(task.id, normalizedColor);
			}
		}
	}

	return existingTaskColors;
};

const pickFallbackTagColor = (label: string) => {
	const normalizedLabel = label.trim().toLowerCase() || 'tag';
	let hash = 0;

	for (const character of normalizedLabel) {
		hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
	}

	return VALID_TAG_COLOR_VALUES[hash % VALID_TAG_COLOR_VALUES.length];
};

const normalizeTagColor = (
	color: string | undefined,
	label: string,
	existingTagColors: Map<string, string>
) => {
	const normalizedLabel = label.trim().toLowerCase();
	const existingColor = normalizedLabel ? existingTagColors.get(normalizedLabel) : undefined;
	const normalizedColor = normalizeToneValue(color, existingColor);

	if (normalizedColor) {
		if (normalizedLabel) {
			existingTagColors.set(normalizedLabel, normalizedColor);
		}
		return normalizedColor;
	}

	const resolvedColor = existingColor || pickFallbackTagColor(label);
	if (normalizedLabel) {
		existingTagColors.set(normalizedLabel, resolvedColor);
	}
	return resolvedColor;
};

const normalizeProposalKanbanColors = (
	kanbanData: KanbanData,
	existingTagColors = buildExistingTagColorMap(kanbanData),
	existingTaskColors = buildExistingTaskColorMap(kanbanData),
	existingColumnColors = buildExistingColumnColorMap(kanbanData)
): KanbanData =>
	kanbanData.map((column) => ({
		...column,
		color: normalizeToneValue(column.color, existingColumnColors.get(column.id)),
		tasks: column.tasks.map((task) => ({
			...task,
			color: normalizeToneValue(task.color, existingTaskColors.get(task.id)),
			tags: (task.tags || []).map((tag) => ({
				...tag,
				color: normalizeTagColor(tag.color, tag.label, existingTagColors)
			}))
		}))
	}));

const normalizeProposal = (
	proposal: AiWorkspaceResponse['proposal'],
	request: AiWorkspaceRequest
): AiWorkspaceResponse['proposal'] => {
	if (proposal.kind !== 'kanban' || !proposal.kanbanData) {
		return proposal;
	}

	return {
		...proposal,
		kanbanData: normalizeProposalKanbanColors(
			proposal.kanbanData,
			buildExistingTagColorMap(request.kanbanData),
			buildExistingTaskColorMap(request.kanbanData),
			buildExistingColumnColorMap(request.kanbanData)
		)
	};
};

const taskSchema = {
	type: 'object',
	additionalProperties: false,
	properties: {
		id: { type: 'string' },
		title: { type: 'string' },
		description: { type: 'string' },
		color: { type: 'string', enum: [...VALID_TAG_COLOR_VALUES] },
		tags: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				properties: {
					id: { type: 'string' },
					label: { type: 'string' },
					color: { type: 'string', enum: [...VALID_TAG_COLOR_VALUES] }
				},
				required: ['id', 'label', 'color']
			}
		},
		hasCheckbox: { type: 'boolean' },
		checked: { type: 'boolean' },
		completedAt: { type: 'number' },
		countdownAt: { type: 'number' },
		alarmAt: { type: 'number' }
	},
	required: ['id', 'title', 'tags']
};

const columnSchema = {
	type: 'object',
	additionalProperties: false,
	properties: {
		id: { type: 'string' },
		title: { type: 'string' },
		color: { type: 'string', enum: [...VALID_TAG_COLOR_VALUES] },
		tasks: {
			type: 'array',
			items: taskSchema
		}
	},
	required: ['id', 'title', 'tasks']
};

const responseSchema = {
	type: 'object',
	additionalProperties: false,
	properties: {
		reply: { type: 'string' },
		proposal: {
			type: 'object',
			additionalProperties: false,
			properties: {
				kind: { type: 'string', enum: ['none', 'kanban', 'scratchpad'] },
				summary: { type: 'string' },
				kanbanData: {
					type: 'array',
					items: columnSchema
				},
				scratchpadData: { type: 'string' }
			},
			required: ['kind']
		},
		highlightedTaskIds: {
			type: 'array',
			items: { type: 'string' }
		}
	},
	required: ['reply', 'proposal', 'highlightedTaskIds']
};

const classifierSchema = {
	type: 'object',
	additionalProperties: false,
	properties: {
		intent: { type: 'string', enum: ['chat', 'edit'] },
		complexity: { type: 'string', enum: ['simple', 'complex'] },
		includeKanban: { type: 'boolean' },
		includeScratchpad: { type: 'boolean' },
		useWebSearch: { type: 'boolean' }
	},
	required: ['intent', 'complexity', 'includeKanban', 'includeScratchpad', 'useWebSearch']
};

const getFastModel = () =>
	getEnv('OPENROUTER_FAST_MODEL', 'google/gemini-3.1-flash-lite-preview:nitro');
const getSmartModel = () => getEnv('OPENROUTER_SMART_MODEL', 'google/gemini-3-flash-preview:nitro');
const getReferer = () => getEnv('OPENROUTER_HTTP_REFERER', 'https://kainbu.app');
const getTitle = () => getEnv('OPENROUTER_APP_TITLE', 'Kainbu');

const openRouterHeaders = () => ({
	Authorization: `Bearer ${getRequiredEnv('OPENROUTER_API_KEY')}`,
	'HTTP-Referer': getReferer(),
	'X-OpenRouter-Title': getTitle(),
	'Content-Type': 'application/json'
});

const needsFreshness = (text: string) =>
	/\b(latest|current|today|recent|news|price|pricing|version|release|launch|schedule|score|this week)\b/i.test(
		text
	);

const parseStructuredResponse = <T>(payload: any) => {
	const content = payload?.choices?.[0]?.message?.content;

	if (typeof content !== 'string') {
		throw new Error('OpenRouter returned an unexpected response payload.');
	}

	return JSON.parse(content) as T;
};

const mapAnnotations = (payload: any) =>
	((payload?.choices?.[0]?.message?.annotations || []) as OpenRouterAnnotation[]).map(
		(annotation) => {
			const citation = annotation.url_citation || {};

			return {
				type: annotation.type,
				title: citation.title,
				url: citation.url,
				content: citation.content,
				startIndex: citation.start_index,
				endIndex: citation.end_index
			};
		}
	);

const buildClassifierPrompt = (history: ChatMessage[]) => {
	const lastUserMessage = [...history].reverse().find((message) => message.role === 'user');
	const recentTranscript = history
		.slice(-4)
		.map((message) => `${message.role.toUpperCase()}: ${message.text}`)
		.join('\n');

	return [
		'Classify the latest user turn for an AI project workspace.',
		'Choose intent "edit" only when the user is asking to modify kanban tasks, project structure, or the scratchpad.',
		'Set includeKanban/includeScratchpad only when those contexts are needed to answer well.',
		'Set useWebSearch true only when the user asks for fresh external information.',
		`Recent transcript:\n${recentTranscript}`,
		`Latest user turn:\n${lastUserMessage?.text || ''}`
	].join('\n\n');
};

const buildOpenRouterMessages = (history: ChatMessage[]) =>
	history.map((message) => {
		if (message.role === 'assistant') {
			return {
				role: 'assistant',
				content: message.text
			};
		}

		const textPart: { type: 'text'; text: string } = { type: 'text', text: message.text };
		const parts: Array<
			{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
		> = [textPart];

		for (const attachment of message.attachments || []) {
			if (attachment.kind === 'image') {
				parts.push({
					type: 'image_url',
					image_url: { url: attachment.content }
				});
			}

			if (attachment.kind === 'text') {
				textPart.text += `\n\n--- Attachment: ${attachment.name} ---\n${attachment.content}\n--- End Attachment ---`;
			}
		}

		return {
			role: 'user',
			content: parts
		};
	});

const classifyRequest = async (request: AiWorkspaceRequest, userId: string) => {
	const payload = {
		model: getFastModel(),
		user: userId,
		messages: [
			{
				role: 'system',
				content:
					'Return only valid JSON. Focus on intent, context relevance, and whether fresh web grounding is needed.'
			},
			{
				role: 'user',
				content: buildClassifierPrompt(request.history)
			}
		],
		response_format: {
			type: 'json_schema',
			json_schema: {
				name: 'workspace_classifier',
				strict: true,
				schema: classifierSchema
			}
		},
		plugins: [{ id: 'response-healing' }]
	};

	const response = await fetch(OPENROUTER_API_URL, {
		method: 'POST',
		headers: openRouterHeaders(),
		body: JSON.stringify(payload)
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Classifier request failed: ${response.status} ${errorText}`);
	}

	const raw = await response.json();
	const classification = parseStructuredResponse<Classification>(raw);
	const lastText = request.history.at(-1)?.text || '';

	return {
		...classification,
		useWebSearch: classification.useWebSearch || needsFreshness(lastText)
	};
};

const buildSystemPrompt = (
	request: AiWorkspaceRequest,
	classification: Classification,
	effectiveMode: ChatMode
) => {
	const contextBlocks = [
		'You are Kainbu, an AI project workspace assistant.',
		'Be concise, practical, and preserve existing ids and fields unless a change is required.',
		'If a user only wants analysis or conversation, keep proposal.kind as "none".',
		'If a user asks for kanban edits, return the full updated board in proposal.kanbanData.',
		'If a user asks for scratchpad edits, return the full updated markdown in proposal.scratchpadData.',
		'Only the active scratchpad pad is provided to you. Do not assume or reference any other pads.',
		'Use highlightedTaskIds for tasks the UI should emphasize.',
		TAG_COLOR_INSTRUCTIONS,
		SURFACE_COLOR_INSTRUCTIONS,
		'Tasks can have due dates via the countdownAt field (a Unix millisecond timestamp). Set countdownAt to assign a due date, or omit/null it to clear. When the user asks to set, change, or remove a due date, update countdownAt accordingly. Do not use alarmAt — it is legacy.'
	];

	if (effectiveMode === 'chat') {
		contextBlocks.push('You are in read-only mode. proposal.kind must be "none".');
	}

	if (effectiveMode === 'edit') {
		contextBlocks.push(
			'You are in workspace edit mode. Use only the provided kanban, scratchpad, chat history, and attachments to make changes.',
			'Do not browse, cite, link to, or mention external websites, repositories, search results, or sources. If the request is missing details, say what is missing instead of inventing outside research.'
		);
	}

	if (!classification.useWebSearch) {
		contextBlocks.push(
			'Do not include external citations, links, or references in the reply unless the user explicitly asked for external research.'
		);
	}

	if (classification.includeKanban) {
		contextBlocks.push(`Current kanban board:\n${JSON.stringify(request.kanbanData)}`);
	}

	if (classification.includeScratchpad) {
		contextBlocks.push(`Current scratchpad:\n${request.scratchpadData}`);
	}

	return contextBlocks.join('\n\n');
};

const callMainModel = async (
	request: AiWorkspaceRequest,
	userId: string,
	classification: Classification,
	effectiveMode: ChatMode
) => {
	const model = request.modelPreset === 'smart' ? getSmartModel() : getFastModel();
	const plugins: Array<Record<string, unknown>> = [{ id: 'response-healing' }];

	if (classification.useWebSearch && effectiveMode !== 'edit') {
		plugins.push({
			id: 'web',
			max_results: 4
		});
	}

	const payload = {
		model,
		user: userId,
		messages: [
			{
				role: 'system',
				content: buildSystemPrompt(request, classification, effectiveMode)
			},
			...buildOpenRouterMessages(request.history)
		],
		response_format: {
			type: 'json_schema',
			json_schema: {
				name: 'workspace_response',
				strict: true,
				schema: responseSchema
			}
		},
		plugins
	};

	const response = await fetch(OPENROUTER_API_URL, {
		method: 'POST',
		headers: openRouterHeaders(),
		body: JSON.stringify(payload)
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Workspace model request failed: ${response.status} ${errorText}`);
	}

	return {
		raw: await response.json(),
		model
	};
};

const deriveToolActions = (
	proposal: AiWorkspaceResponse['proposal'],
	highlightedTaskIds: string[]
): WorkspaceAction[] => {
	const toolActions: WorkspaceAction[] = [];

	if (proposal.kind === 'kanban') {
		toolActions.push('kanban');
	}

	if (proposal.kind === 'scratchpad') {
		toolActions.push('scratchpad');
	}

	if (highlightedTaskIds.length) {
		toolActions.push('highlights');
	}

	return toolActions;
};

export const handleWorkspaceAiRequest = async (
	body: AiWorkspaceRequest,
	authorization: string | undefined
): Promise<AiWorkspaceResponse> => {
	getRequiredEnv('OPENROUTER_API_KEY');

	const userId = await getAuthenticatedUserId(authorization);
	const startedAt = Date.now();
	const initialClassification = await classifyRequest(body, userId);
	const effectiveMode = body.chatMode === 'auto' ? initialClassification.intent : body.chatMode;
	const classification: Classification = {
		...initialClassification,
		useWebSearch: effectiveMode === 'chat' ? initialClassification.useWebSearch : false
	};

	const result = await callMainModel(body, userId, classification, effectiveMode);
	const parsed = parseStructuredResponse<{
		reply: string;
		proposal: AiWorkspaceResponse['proposal'];
		highlightedTaskIds: string[];
	}>(result.raw);
	const normalizedProposal = normalizeProposal(parsed.proposal, body);
	const proposal = effectiveMode === 'chat' ? { kind: 'none' as const } : normalizedProposal;

	return {
		reply: parsed.reply,
		mode: effectiveMode,
		model: result.model,
		latencyMs: Date.now() - startedAt,
		proposal,
		highlightedTaskIds: parsed.highlightedTaskIds,
		annotations: classification.useWebSearch ? mapAnnotations(result.raw) : [],
		toolActions: deriveToolActions(proposal, parsed.highlightedTaskIds)
	};
};
