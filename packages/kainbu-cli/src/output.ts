import { c } from './color.js';

export type OutputMode = {
	json: boolean;
	quiet: boolean;
};

export const printResult = (mode: OutputMode, payload: unknown, humanLines?: string[]) => {
	if (mode.json) {
		console.log(JSON.stringify(payload, null, 2));
		return;
	}

	if (mode.quiet) return;

	for (const line of humanLines || []) {
		console.log(line);
	}
};

export const printError = (message: string, hint?: string) => {
	console.error(`${c.red(c.bold('Error:'))} ${message}`);
	if (hint) console.error(`${c.yellow('Hint:')} ${hint}`);
};
