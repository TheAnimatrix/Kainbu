import { createInterface } from 'node:readline';

const isTty = (): boolean => Boolean(process.stdin.isTTY && process.stdout.isTTY);

/**
 * Reads a single line of input from stdin. If the stream is a TTY and
 * `hidden` is true, the input is masked with `*` and never echoed back.
 * Resolves to null on EOF so callers can show a "cancelled" message.
 */
export const promptLine = (question: string, options: { hidden?: boolean } = {}): Promise<string | null> => {
	if (!isTty()) {
		return new Promise((resolve) => {
			const chunks: Buffer[] = [];
			const onData = (chunk: Buffer | string) => {
				chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
			};
			const onEnd = () => {
				process.stdin.removeListener('data', onData);
				const value = Buffer.concat(chunks).toString('utf8').trim();
				resolve(value || null);
			};
			process.stdin.on('data', onData);
			process.stdin.on('end', onEnd);
			process.stdin.on('error', () => {
				process.stdin.removeListener('data', onData);
				process.stdin.removeListener('end', onEnd);
				resolve(null);
			});
			// No question to print in non-TTY mode.
		}).then((value) => {
			if (value !== null) return value;
			return null;
		});
	}

	if (options.hidden) {
		return new Promise((resolve) => {
			process.stdout.write(question);
			let input = '';
			const previousRaw = process.stdin.isRaw;
			if (process.stdin.setRawMode) {
				process.stdin.setRawMode(true);
			}
			process.stdin.resume();

			const finish = (value: string) => {
				if (process.stdin.setRawMode) {
					process.stdin.setRawMode(Boolean(previousRaw));
				}
				process.stdin.removeListener('data', onData);
				process.stdin.pause();
				resolve(value);
			};

			const onData = (chunk: Buffer | string) => {
				const value = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
				for (const char of value) {
					const code = char.charCodeAt(0);
					if (code === 13 || code === 10) {
						process.stdout.write('\n');
						finish(input);
						return;
					}
					if (code === 3) {
						process.stdout.write('\n');
						process.exit(130);
						return;
					}
					if (code === 127 || code === 8) {
						if (input.length > 0) {
							input = input.slice(0, -1);
							process.stdout.write('\b \b');
						}
						continue;
					}
					if (code === 4) {
						// Ctrl+D — end of input
						process.stdout.write('\n');
						finish(input);
						return;
					}
					input += char;
					process.stdout.write('*');
				}
			};
			process.stdin.on('data', onData);
		});
	}

	return new Promise((resolve) => {
		const rl = createInterface({
			input: process.stdin,
			output: process.stdout,
			terminal: true
		});
		rl.question(question, (answer) => {
			rl.close();
			resolve(answer);
		});
	});
};

export const isInteractive = isTty;

/**
 * Renders a simple numbered picker to stdout, returns the chosen 1-based
 * index (or null if the user typed something outside the range).
 */
export const promptChoice = async (question: string, options: string[]): Promise<number | null> => {
	if (options.length === 0) return null;
	const lines = options.map((opt, index) => `  ${index + 1}) ${opt}`);
	process.stdout.write(`${question}\n${lines.join('\n')}\n> `);

	const answer = await promptLine('');
	if (answer === null) return null;
	const trimmed = answer.trim();
	if (!trimmed) return null;
	const parsed = Number.parseInt(trimmed, 10);
	if (!Number.isFinite(parsed) || parsed < 1 || parsed > options.length) return null;
	return parsed;
};
