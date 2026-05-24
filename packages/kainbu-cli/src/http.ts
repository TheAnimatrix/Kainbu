export const readJsonResponse = async <T>(response: Response, context: string): Promise<T> => {
	const text = await response.text();
	const trimmed = text.trim();

	if (!trimmed) {
		throw new Error(`${context}: empty response (HTTP ${response.status}).`);
	}

	try {
		return JSON.parse(trimmed) as T;
	} catch {
		const preview = trimmed.replace(/\s+/g, ' ').slice(0, 160);
		const hint =
			trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')
				? ' The URL may be pointing at the web app instead of the API — set KAINBU_API_BASE (e.g. http://127.0.0.1:8788).'
				: '';
		throw new Error(`${context}: expected JSON, got HTTP ${response.status}: ${preview}${hint}`);
	}
};
