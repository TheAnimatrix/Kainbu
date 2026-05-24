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
