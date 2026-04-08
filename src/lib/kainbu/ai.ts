import {
	getWorkspaceApiAccessToken,
	invokeWorkspaceApi,
	resolveWorkspaceApiUrl
} from '$lib/kainbu/api';
import type {
	AiModelConfig,
	AiProgressEvent,
	AiWorkspaceRequest,
	AiWorkspaceResponse,
	AiWorkspaceStreamEvent
} from '$lib/kainbu/types';

type InvokeWorkspaceAiOptions = {
	onProgress?: (event: AiProgressEvent) => void;
};

const WORKSPACE_AI_REQUEST_TIMEOUT_MS = 180_000;
const WORKSPACE_AI_MODELS_PATH = '/api/models';

const invokeWorkspaceAiFallback = (request: AiWorkspaceRequest) =>
	invokeWorkspaceApi<AiWorkspaceResponse>('/api/workspace-ai', {
		body: request
	});

const parseSseEvent = (rawEvent: string): { eventName: string; dataText: string } | null => {
	const trimmed = rawEvent.trim();
	if (!trimmed) return null;

	let eventName = 'message';
	const dataLines: string[] = [];

	for (const line of trimmed.split(/\r?\n/)) {
		if (line.startsWith('event:')) {
			eventName = line.slice('event:'.length).trim() || 'message';
			continue;
		}

		if (line.startsWith('data:')) {
			dataLines.push(line.slice('data:'.length).trimStart());
		}
	}

	if (!dataLines.length) {
		return null;
	}

	return {
		eventName,
		dataText: dataLines.join('\n')
	};
};

export const invokeWorkspaceAi = async (
	request: AiWorkspaceRequest,
	options: InvokeWorkspaceAiOptions = {}
) => {
	try {
		const accessToken = await getWorkspaceApiAccessToken();
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), WORKSPACE_AI_REQUEST_TIMEOUT_MS);

		try {
			const response = await fetch(resolveWorkspaceApiUrl('/api/workspace-ai/stream'), {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'text/event-stream',
					Authorization: `Bearer ${accessToken}`
				},
				body: JSON.stringify(request),
				signal: controller.signal
			});

			if (!response.ok || !response.body) {
				return await invokeWorkspaceAiFallback(request);
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			let finalResponse: AiWorkspaceResponse | null = null;

			while (true) {
				const { done, value } = await reader.read();
				buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

				let boundaryIndex = buffer.indexOf('\n\n');
				while (boundaryIndex !== -1) {
					const rawEvent = buffer.slice(0, boundaryIndex);
					buffer = buffer.slice(boundaryIndex + 2);
					const parsed = parseSseEvent(rawEvent);

					if (parsed) {
						const payload = JSON.parse(parsed.dataText) as AiWorkspaceStreamEvent;

						if (parsed.eventName === 'progress' && payload.type === 'progress') {
							options.onProgress?.(payload.progress);
						}

						if (parsed.eventName === 'final' && payload.type === 'final') {
							finalResponse = payload.response;
						}

						if (parsed.eventName === 'error' && payload.type === 'error') {
							throw new Error(payload.error);
						}
					}

					boundaryIndex = buffer.indexOf('\n\n');
				}

				if (done) {
					break;
				}
			}

			if (!finalResponse) {
				return await invokeWorkspaceAiFallback(request);
			}

			return finalResponse;
		} finally {
			clearTimeout(timeout);
		}
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') {
			throw new Error('The AI request took too long. Please try again.');
		}

		if (error instanceof Error && error.message.includes('workspace actions')) {
			throw new Error('You need to sign in again before using AI.');
		}

		try {
			return await invokeWorkspaceAiFallback(request);
		} catch (fallbackError) {
			if (fallbackError instanceof Error && fallbackError.message.includes('workspace actions')) {
				throw new Error('You need to sign in again before using AI.');
			}

			throw fallbackError;
		}
	}
};

export const generateSessionTitle = async (
	userMessage: string,
	assistantReply: string
): Promise<string> => {
	try {
		const accessToken = await getWorkspaceApiAccessToken();
		const response = await fetch(
			resolveWorkspaceApiUrl('/api/workspace-ai/session-title'),
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${accessToken}`
				},
				body: JSON.stringify({ userMessage, assistantReply })
			}
		);

		if (!response.ok) return '';

		const data = (await response.json()) as { title?: string };
		const title = (data.title || '').trim();
		return title.length > 0 && title.length <= 60 ? title : '';
	} catch {
		return '';
	}
};

export const fetchWorkspaceAiModels = async () => {
	const response = await fetch(resolveWorkspaceApiUrl(WORKSPACE_AI_MODELS_PATH), {
		method: 'GET',
		headers: {
			Accept: 'application/json'
		}
	});

	const responseText = await response.text();
	if (!response.ok) {
		throw new Error(responseText.trim() || 'Unable to load AI models.');
	}

	return (responseText.trim() ? JSON.parse(responseText) : []) as AiModelConfig[];
};
