import {
	WORKSPACE_AI_ADD_TASKS_MAX_TITLES,
	WORKSPACE_AI_BULK_UPDATE_TASKS_MAX,
	WORKSPACE_AI_DELETE_TASKS_MAX_REFS,
	WORKSPACE_AI_WEB_SEARCH_MAX_TOKENS,
	WORKSPACE_AI_WEB_SEARCH_MODEL
} from './constants.js';
import { getEnv } from '../env.js';
import { getOpenRouterApiKey, getAiGatewayApiKey } from '../openrouter-key.js';

const TONE_COLOR_ENUM = [
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

const tagInputProperties = {
	label: { type: 'string', description: 'Tag label' },
	color: {
		type: 'string',
		enum: [...TONE_COLOR_ENUM],
		description: 'Optional tag color tone (default tone:blue)'
	}
};

const taskUpdateProperties = {
	title: { type: 'string' },
	description: { type: 'string' },
	color: {
		type: ['string', 'null'],
		enum: [...TONE_COLOR_ENUM, null],
		description: 'Card color tone, or null to clear'
	},
	hasCheckbox: { type: 'boolean', description: 'Show checkbox on card' },
	checked: { type: 'boolean', description: 'Checkbox checked state (implies hasCheckbox)' },
	addTags: {
		type: 'array',
		items: {
			anyOf: [{ type: 'string' }, { type: 'object', properties: tagInputProperties, required: ['label'] }]
		},
		description:
			'Tags to add (string or { label, color? }). If the label already exists and color is set, updates that tag color.'
	},
	updateTags: {
		type: 'array',
		items: {
			type: 'object',
			properties: tagInputProperties,
			required: ['label', 'color']
		},
		description: 'Change color of existing tags by label ({ label, color } with tone:* values). Adds the tag if missing.'
	},
	removeTags: {
		type: 'array',
		items: { type: 'string' },
		description: 'Tag labels to remove (case insensitive)'
	}
};

const taskDraftProperties = {
	title: { type: 'string' },
	description: { type: 'string' },
	color: { type: 'string', enum: [...TONE_COLOR_ENUM] },
	hasCheckbox: { type: 'boolean' },
	checked: { type: 'boolean' },
	tags: {
		type: 'array',
		items: {
			anyOf: [{ type: 'string' }, { type: 'object', properties: tagInputProperties, required: ['label'] }]
		},
		description: 'Initial tags (string or { label, color? })'
	}
};

export const webSearch = async (query: string): Promise<string> => {
	const openRouterKey = await getOpenRouterApiKey();
	const vercelKey = await getAiGatewayApiKey();
	const apiKey = openRouterKey || vercelKey;
	if (!apiKey)
		return JSON.stringify({ ok: false, error: 'Web search is not available (missing API key).' });

	const endpoint = openRouterKey
		? 'https://openrouter.ai/api/v1/chat/completions'
		: 'https://ai-gateway.vercel.sh/v1/chat/completions';
	const isOpenRouter = Boolean(openRouterKey);

	try {
		const res = await fetch(endpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`,
				...(isOpenRouter ? { 'HTTP-Referer': 'https://kainbu.test', 'X-Title': 'Kainbu Web Search' } : {})
			},
			body: JSON.stringify({
				model: WORKSPACE_AI_WEB_SEARCH_MODEL,
				max_tokens: WORKSPACE_AI_WEB_SEARCH_MAX_TOKENS,
				messages: [
					{
						role: 'system',
						content:
							'Search the web for the following query. Return a concise, factual summary of the top results. Include relevant URLs where helpful.'
					},
					{ role: 'user', content: query }
				]
			})
		});

		if (!res.ok) {
			const errorText = await res.text().catch(() => '');
			return JSON.stringify({
				ok: false,
				error: `Web search failed (${res.status}): ${errorText.slice(0, 200)}`
			});
		}

		const data = await res.json();
		const content = data.choices?.[0]?.message?.content;
		return JSON.stringify({
			ok: true,
			summary:
				typeof content === 'string' && content.trim()
					? content.trim()
					: 'Web search returned no results.'
		});
	} catch (e: unknown) {
		return JSON.stringify({
			ok: false,
			error: `Web search failed: ${e instanceof Error ? e.message : 'Unknown error'}`
		});
	}
};

export const OpenRouterTools = [
	{
		type: 'function',
		function: {
			name: 'board_list_columns',
			description:
				'List all columns on the current board with refs (C1, C2, …), task counts, and colors.',
			parameters: { type: 'object', properties: {} }
		}
	},
	{
		type: 'function',
		function: {
			name: 'board_list_tasks',
			description:
				'List tasks in one column with refs, colors, tags, and checkbox state. Use columnRef from board_list_columns or the board index. Paginate with offset when hasMore is true.',
			parameters: {
				type: 'object',
				properties: {
					columnRef: { type: 'string', description: 'Column ref e.g. C1' },
					offset: { type: 'number', description: 'Skip this many tasks (default 0)' },
					limit: { type: 'number', description: 'Max tasks to return (default 15)' }
				},
				required: ['columnRef']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'add_tasks',
			description: `Add new tasks to a column. Max ${WORKSPACE_AI_ADD_TASKS_MAX_TITLES} per call. Use titles for simple creates, or tasks[] for optional description, color, checkbox, and tags. Call again in later tool rounds if more tasks are needed.`,
			parameters: {
				type: 'object',
				properties: {
					columnRef: { type: 'string', description: 'Column ref e.g. C1' },
					titles: {
						type: 'array',
						items: { type: 'string' },
						description: 'Simple task titles (ignored if tasks is provided)'
					},
					tasks: {
						type: 'array',
						items: {
							type: 'object',
							properties: taskDraftProperties,
							required: ['title']
						},
						description: 'Rich task drafts with optional description, color, checkbox, tags'
					}
				},
				required: ['columnRef']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'update_task',
			description:
				'Update one task by taskRef: title, description, color (tone:* or null to clear), hasCheckbox, checked, addTags, updateTags, removeTags.',
			parameters: {
				type: 'object',
				properties: {
					taskRef: { type: 'string', description: 'Task ref e.g. T1' },
					...taskUpdateProperties
				},
				required: ['taskRef']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'bulk_update_tasks',
			description: `Update up to ${WORKSPACE_AI_BULK_UPDATE_TASKS_MAX} tasks in one call (title, description, color, hasCheckbox, checked, addTags, updateTags, removeTags). Use for batch checkbox/color/tag changes.`,
			parameters: {
				type: 'object',
				properties: {
					updates: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								taskRef: { type: 'string' },
								...taskUpdateProperties
							},
							required: ['taskRef']
						}
					}
				},
				required: ['updates']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'add_column',
			description:
				'Add a new column to the board. Optional color (tone:*) and afterColumnRef to insert after an existing column.',
			parameters: {
				type: 'object',
				properties: {
					title: { type: 'string', description: 'Column title' },
					color: { type: 'string', enum: [...TONE_COLOR_ENUM] },
					afterColumnRef: {
						type: 'string',
						description: 'Insert after this column ref; omit to append at end'
					}
				},
				required: ['title']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'update_column',
			description: 'Update a column title and/or color (tone:* or null to clear).',
			parameters: {
				type: 'object',
				properties: {
					columnRef: { type: 'string', description: 'Column ref e.g. C1' },
					title: { type: 'string' },
					color: {
						type: ['string', 'null'],
						enum: [...TONE_COLOR_ENUM, null]
					}
				},
				required: ['columnRef']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'delete_tasks',
			description: `Delete existing tasks by taskRef from the board index or board_list_tasks. Max ${WORKSPACE_AI_DELETE_TASKS_MAX_REFS} refs per call.`,
			parameters: {
				type: 'object',
				properties: {
					taskRefs: {
						type: 'array',
						items: { type: 'string' },
						description: 'Task refs to delete e.g. T1, T2'
					}
				},
				required: ['taskRefs']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'list_pages',
			description: 'List all notes/pages in the project with pageId and title.',
			parameters: { type: 'object', properties: {} }
		}
	},
	{
		type: 'function',
		function: {
			name: 'get_page',
			description: 'Read a page by pageId, or the currently viewed page when pageId is omitted.',
			parameters: {
				type: 'object',
				properties: {
					pageId: { type: 'string', description: 'Page id from list_pages' }
				}
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'set_page',
			description:
				'Replace a page body with new markdown. Updates the currently viewed page unless pageId is set. Do not use for new notes — use create_page instead.',
			parameters: {
				type: 'object',
				properties: {
					content: { type: 'string', description: 'Full page content' },
					pageId: {
						type: 'string',
						description: 'Optional page id; default is the page the user is viewing'
					}
				},
				required: ['content']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'create_page',
			description:
				'Create a new note/page with title and content. Use when the user wants a separate note, not editing the page they are viewing.',
			parameters: {
				type: 'object',
				properties: {
					title: { type: 'string', description: 'Page title' },
					content: { type: 'string', description: 'Full page content' }
				},
				required: ['title', 'content']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'ask_questions',
			description:
				'Open a structured Q&A panel for the user. Use when you need one or more answers before continuing, especially when the user asks to test or use the Q&A tool.',
			parameters: {
				type: 'object',
				properties: {
					questions: {
						type: 'array',
						minItems: 1,
						maxItems: 6,
						items: {
							type: 'object',
							properties: {
								prompt: { type: 'string', description: 'The question to ask' },
								reason: {
									type: 'string',
									description: 'Optional short reason/context for the question'
								},
								allowFreeform: {
									type: 'boolean',
									description: 'Allow the user to type their own answer'
								},
								options: {
									type: 'array',
									items: {
										type: 'object',
										properties: {
											label: { type: 'string' },
											description: { type: 'string' }
										},
										required: ['label']
									}
								}
							},
							required: ['prompt']
						}
					}
				},
				required: ['questions']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'web_search',
			description: 'Search the web for external information.',
			parameters: {
				type: 'object',
				properties: {
					query: { type: 'string', description: 'The web search query' }
				},
				required: ['query']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'search_tasks',
			description:
				'Search across all board columns for tasks matching a query. Searches task titles, descriptions, and tag labels. Returns matching tasks with refs, column context, and pagination info. Use when the user asks to find a specific task or when board_list_tasks output is too large to scan manually.',
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description: 'Search string. Case-insensitive substring match against title, description, and tag labels. Empty string matches all tasks.'
					},
					columnRef: {
						type: 'string',
						description: 'Optional column ref (e.g. C1) to restrict search to one column.'
					},
					tag: {
						type: 'string',
						description: 'Optional tag label to filter results (case-insensitive exact match).'
					},
					color: {
						type: 'string',
						enum: TONE_COLOR_ENUM,
						description: 'Optional card color tone to filter results.'
					},
					hasCheckbox: {
						type: 'boolean',
						description: 'Filter to tasks with/without checkbox. Omit to include both.'
					},
					checked: {
						type: 'boolean',
						description: 'Filter to checked/unchecked tasks. Omit to include both.'
					},
					offset: {
						type: 'number',
						description: 'Skip this many matching tasks (default 0)'
					},
					limit: {
						type: 'number',
						description: 'Max tasks to return (default 20, max 50)'
					}
				},
				required: ['query']
			}
		}
	}
];
