import { readFile } from 'node:fs/promises';
import { KainbuError } from './errors.js';

/** Stdin is consumed only by explicit --file - / --api-key - options. */
export const readInput = async (path: string): Promise<string> => {
	if (path !== '-') return readFile(path, 'utf8');
	if (process.stdin.isTTY)
		throw new KainbuError('Pipe input when using "-".', { code: 'invalid_input', exitCode: 2 });
	let result = '';
	process.stdin.setEncoding('utf8');
	for await (const chunk of process.stdin) result += chunk;
	return result;
};
