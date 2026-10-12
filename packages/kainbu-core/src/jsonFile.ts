import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

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

/** Errors carrying a CLI error code, mapped to an exit code by the CLI. */
export const codedError = (message: string, code: 'invalid_arguments' | 'not_found') =>
	Object.assign(new Error(message), { code });

const RENAME_RETRY_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);

/**
 * Write via a temp file and rename, so concurrent readers never observe a
 * truncated file. Files are owner-only (mode is ignored on Windows, where the
 * per-user profile directory provides isolation). Windows can briefly refuse
 * the rename while another process has the target open, so retry a few times.
 */
export const writeFileAtomic = async (path: string, data: string) => {
	await mkdir(dirname(path), { recursive: true, mode: 0o700 });
	const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
	await writeFile(temp, data, { encoding: 'utf8', mode: 0o600 });
	for (let attempt = 0; ; attempt += 1) {
		try {
			await rename(temp, path);
			return;
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (attempt >= 5 || !code || !RENAME_RETRY_CODES.has(code)) {
				await rm(temp, { force: true });
				throw error;
			}
			await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
		}
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
