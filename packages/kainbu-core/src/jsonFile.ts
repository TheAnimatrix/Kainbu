import { rename } from 'node:fs/promises';

export const parseJsonFile = <T>(raw: string, label: string): T | null => {
	const trimmed = raw.trim();
	if (!trimmed) return null;

	try {
		return JSON.parse(trimmed) as T;
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Invalid JSON';
		throw new Error(`${label} is not valid JSON (${message}).`);
	}
};

export const quarantineCorruptFile = async (path: string, reason: string) => {
	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	const backupPath = `${path}.corrupt-${stamp}`;
	try {
		await rename(path, backupPath);
	} catch {
		// ignore if missing
	}
	console.warn(`Warning: moved corrupt file to ${backupPath} (${reason})`);
};
