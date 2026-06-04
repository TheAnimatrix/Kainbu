import { getWorkspaceApiAccessToken, resolveWorkspaceApiUrl } from '$lib/kainbu/api';
import type {
	AiModelConfig,
	AiVisionFallbackConfig,
	ChatAttachment,
	ChatMessage
} from '$lib/kainbu/types';

export const transcribeChatImages = async (
	images: ChatAttachment[]
): Promise<Record<string, string>> => {
	const imageAttachments = images.filter((attachment) => attachment.kind === 'image');
	if (!imageAttachments.length) return {};

	const accessToken = await getWorkspaceApiAccessToken();
	const response = await fetch(resolveWorkspaceApiUrl('/api/workspace-ai/transcribe-images'), {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${accessToken}`
		},
		body: JSON.stringify({
			images: imageAttachments.map((attachment) => ({
				id: attachment.id,
				name: attachment.name,
				content: attachment.content
			}))
		})
	});

	const body = (await response.json().catch(() => ({}))) as {
		transcriptions?: Record<string, string>;
		error?: string;
	};
	if (!response.ok) {
		throw new Error(body.error?.trim() || 'Image transcription failed.');
	}

	return body.transcriptions && typeof body.transcriptions === 'object' ? body.transcriptions : {};
};

const imageAttachmentToText = (
	attachment: ChatAttachment,
	transcription: string
): ChatAttachment => ({
	id: attachment.id,
	kind: 'text',
	name: attachment.name,
	mimeType: 'text/plain',
	content: `Image transcription (${attachment.name}):\n${transcription}`
});

export const replaceImageAttachmentsWithTranscriptions = (
	attachments: ChatAttachment[] | undefined,
	transcriptions: Record<string, string>
): ChatAttachment[] | undefined => {
	if (!attachments?.length) return attachments;
	let changed = false;
	const next = attachments.map((attachment) => {
		if (attachment.kind !== 'image') return attachment;
		const transcription = transcriptions[attachment.id]?.trim();
		if (!transcription) return attachment;
		changed = true;
		return imageAttachmentToText(attachment, transcription);
	});
	return changed ? next : attachments;
};

export const prepareChatHistoryForModel = async (
	history: ChatMessage[],
	modelConfig: AiModelConfig | undefined,
	visionFallback: AiVisionFallbackConfig | null
): Promise<ChatMessage[]> => {
	if (modelConfig?.vision !== false) return history;

	const imageAttachments = history.flatMap(
		(message) => message.attachments?.filter((attachment) => attachment.kind === 'image') ?? []
	);
	if (!imageAttachments.length) return history;

	if (!visionFallback?.enabled) {
		throw new Error(
			'This model does not support images. Enable the vision fallback model in admin settings or choose a vision-capable model.'
		);
	}

	const transcriptions = await transcribeChatImages(imageAttachments);
	const missing = imageAttachments.filter((attachment) => !transcriptions[attachment.id]?.trim());
	if (missing.length) {
		throw new Error('Image transcription failed. Try again or use a vision-capable model.');
	}

	return history.map((message) => {
		if (!message.attachments?.some((attachment) => attachment.kind === 'image')) {
			return message;
		}
		return {
			...message,
			attachments: replaceImageAttachmentsWithTranscriptions(message.attachments, transcriptions)
		};
	});
};
