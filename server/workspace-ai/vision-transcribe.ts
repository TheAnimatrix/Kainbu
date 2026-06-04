import { getVisionFallbackModelConfig } from '../ai-models.js';
import { fetchCompletionJson } from './openrouter-stream.js';
import type { OpenRouterMessage } from './openrouter-stream.js';

const TRANSCRIBE_SYSTEM_PROMPT =
	'Transcribe all visible text in the image and briefly describe other relevant visual content. ' +
	'Return plain text only — no markdown fences or preamble.';

const messageText = (value: unknown) => {
	if (typeof value === 'string') return value.trim();
	if (!Array.isArray(value)) return '';
	return value
		.map((part) => {
			if (!part || typeof part !== 'object') return '';
			const entry = part as Record<string, unknown>;
			return entry.type === 'text' && typeof entry.text === 'string' ? entry.text : '';
		})
		.join('')
		.trim();
};

const completionText = (response: unknown) => {
	if (!response || typeof response !== 'object') return '';
	const choices = (response as { choices?: unknown }).choices;
	if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== 'object') return '';
	const message = (choices[0] as { message?: unknown }).message;
	return messageText(message && typeof message === 'object' ? (message as { content?: unknown }).content : '');
};

export type VisionTranscribeImage = {
	id: string;
	name: string;
	content: string;
};

export const transcribeVisionImages = async (
	images: VisionTranscribeImage[],
	options: { userId?: string } = {}
): Promise<Record<string, string>> => {
	const modelConfig = getVisionFallbackModelConfig();
	if (!modelConfig) {
		throw new Error('Vision fallback is not configured.');
	}

	const validImages = images.filter((image) => {
		const url = image.content.trim();
		return (
			image.id &&
			(url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://'))
		);
	});

	if (!validImages.length) {
		return {};
	}

	const results: Record<string, string> = {};

	for (const image of validImages) {
		const messages: OpenRouterMessage[] = [
			{ role: 'system', content: TRANSCRIBE_SYSTEM_PROMPT },
			{
				role: 'user',
				content: [
					{
						type: 'text',
						text: `Image file name: ${image.name || 'attachment'}`
					},
					{
						type: 'image_url',
						image_url: { url: image.content.trim() }
					}
				]
			}
		];

		const { response } = await fetchCompletionJson(messages, false, modelConfig);
		void options.userId;
		const text = completionText(response);
		if (text) {
			results[image.id] = text;
		}
	}

	return results;
};
