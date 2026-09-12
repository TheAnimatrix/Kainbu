import { c } from './color.js';
import { getInvocation } from './invocation.js';
import { describeError } from './errors.js';

export type OutputMode = {
	json: boolean;
	quiet: boolean;
};

export const printResult = (mode: OutputMode, payload: unknown, humanLines?: string[]) => {
	if (mode.json || getInvocation().json) {
		console.log(JSON.stringify(payload, null, 2));
		return;
	}

	if (mode.quiet) return;

	for (const line of humanLines || []) {
		console.log(line);
	}
};

export const printSuccess = (payload: Record<string, unknown>, ...humanLines: string[]) =>
	printResult({ json: false, quiet: false }, { ok: true, ...payload }, humanLines);

export const printError = (error: unknown) => {
	const detail = describeError(error);
	if (getInvocation().json) console.error(JSON.stringify({ ok: false, error: detail.error }));
	else {
		console.error(`${c.red(c.bold('Error:'))} ${detail.error.message}`);
		if (detail.error.hint) console.error(`${c.yellow('Hint:')} ${detail.error.hint}`);
	}
	return detail.exitCode;
};
