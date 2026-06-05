import type { ChatAttachment, ChatMessage } from "./types.js";
import { WORKSPACE_AI_READ_MAX_CHARS } from "./constants.js";
import type { OpenRouterMessage } from "./openrouter-stream.js";

type TextContentPart = { type: "text"; text: string };
type ImageContentPart = { type: "image_url"; image_url: { url: string } };
type UserContentPart = TextContentPart | ImageContentPart;

const truncateTextAttachment = (content: string) => {
	if (content.length <= WORKSPACE_AI_READ_MAX_CHARS) return content;
	return `${content.slice(0, WORKSPACE_AI_READ_MAX_CHARS)}\n…(truncated)`;
};

export const formatTextAttachments = (attachments: ChatAttachment[]) => {
	const textAttachments = attachments.filter((attachment) => attachment.kind === "text");
	if (!textAttachments.length) return "";

	return textAttachments
		.map(
			(attachment) =>
				`Attached file "${attachment.name}":\n\`\`\`\n${truncateTextAttachment(attachment.content)}\n\`\`\``
		)
		.join("\n\n");
};

export const buildUserMessageContent = (
	text: string,
	attachments: ChatAttachment[] | undefined,
	suffix?: string
): string | UserContentPart[] => {
	const parts: UserContentPart[] = [];
	const attachmentText = attachments?.length ? formatTextAttachments(attachments) : "";
	const imageAttachments = attachments?.filter((attachment) => attachment.kind === "image") ?? [];

	let combinedText = text.trim();
	if (attachmentText) {
		combinedText = combinedText ? `${combinedText}\n\n${attachmentText}` : attachmentText;
	}
	if (suffix?.trim()) {
		combinedText = combinedText ? `${combinedText}\n\n${suffix.trim()}` : suffix.trim();
	}

	if (combinedText) {
		parts.push({ type: "text", text: combinedText });
	}

	for (const image of imageAttachments) {
		const url = image.content.trim();
		if (!url.startsWith("data:") && !url.startsWith("http://") && !url.startsWith("https://")) {
			continue;
		}
		parts.push({ type: "image_url", image_url: { url } });
	}

	if (!parts.length) return "";
	if (parts.length === 1 && parts[0].type === "text") return parts[0].text;
	return parts;
};

export const buildHistoryMessages = (history: ChatMessage[]): OpenRouterMessage[] =>
	history.map((message) => {
		if (message.role === "assistant") {
			return { role: "assistant", content: message.text };
		}

		return {
			role: "user",
			content: buildUserMessageContent(message.text, message.attachments),
		};
	});
