/** Strip model-native tool markup (e.g. DSML) that must not appear in user-facing chat. */
export const stripInternalAiMarkup = (text: string) => {
	const blockPattern = /<\|DSML\|[^>]*>[\s\S]*?<\/\|DSML\|[^>]*>/gi;
	const orphanPattern = /<\/?\|DSML\|[^>]*>/gi;

	let result = text;
	let previous = '';
	while (result !== previous) {
		previous = result;
		result = result.replace(blockPattern, '');
	}
	return result
		.replace(orphanPattern, '')
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
};

/** Tighten gaps between consecutive list items only — keep paragraph breaks around lists. */
const collapseLooseListSpacing = (text: string) =>
	text.replace(
		/([ \t]*(?:[-*+]|\d+\.)\s[^\n]*)\n{2,}(?=[ \t]*(?:[-*+]|\d+\.)\s)/g,
		'$1\n'
	);

export const sanitizeUserFacingAiReply = (text: string) =>
	collapseLooseListSpacing(
		stripInternalAiMarkup(text)
			.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '')
			.replace(/\((?:taskId|columnId|taskRef|columnRef):[^)]+\)/gi, '')
			.replace(/\b(?:taskId|columnId|taskRef|columnRef):\s*[^\s,)]+/gi, '')
			.replace(/\(\s*\)/g, '')
			.replace(/[ \t]+\n/g, '\n')
			.replace(/\n{3,}/g, '\n\n')
			.trim()
	);
