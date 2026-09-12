export class KainbuError extends Error {
	code: string;
	hint?: string;
	exitCode: number;

	constructor(message: string, options: { code?: string; hint?: string; exitCode?: number } = {}) {
		super(message);
		this.name = 'KainbuError';
		this.code = options.code || 'error';
		this.hint = options.hint;
		this.exitCode = options.exitCode ?? 1;
	}
}

export const isKainbuError = (error: unknown): error is KainbuError => error instanceof KainbuError;

export const describeError = (value: unknown) => {
	const error = value instanceof Error ? value : new Error(String(value));
	const status = 'status' in error ? Number(error.status) : undefined;
	let code = 'request_failed';
	let exitCode = 1;
	let hint: string | undefined;
	if (isKainbuError(error)) ({ code, exitCode, hint } = error);
	else if ('code' in error && error.code === 'invalid_config') {
		code = 'invalid_config';
		exitCode = 2;
	} else if ('code' in error && error.code === 'ENOENT') {
		code = 'not_found';
		exitCode = 4;
	} else if ('code' in error && String(error.code).startsWith('commander.')) {
		code = 'invalid_arguments';
		exitCode = 2;
	} else if (status === 400 || status === 422) {
		code = 'invalid_arguments';
		exitCode = 2;
	} else if (status === 401) {
		code = 'unauthenticated';
		exitCode = 3;
	} else if (status === 403) {
		code = 'forbidden';
		exitCode = 3;
	} else if (status === 404) {
		code = 'not_found';
		exitCode = 4;
	} else if (status === 409) {
		code = 'conflict';
		exitCode = 5;
	} else if (error.name === 'TimeoutError' || error.name === 'AbortError') {
		code = 'timeout';
		hint = 'A write may have reached the server. Read the affected resource before retrying.';
	} else if (error instanceof TypeError && /fetch failed/i.test(error.message)) {
		code = 'network_error';
		hint = 'A write may have reached the server. Read the affected resource before retrying.';
	}
	return {
		exitCode,
		error: {
			code,
			message: error.message.replace(/^error: /, ''),
			...(hint ? { hint } : {}),
			...(status ? { status } : {})
		}
	};
};
