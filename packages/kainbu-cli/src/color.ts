/**
 * Tiny, zero-dependency ANSI color helper.
 *
 * Color is enabled only when stdout is a TTY, honoring the de-facto
 * conventions: `NO_COLOR` (any value) force-disables, `FORCE_COLOR` (anything
 * other than "0") force-enables. When disabled, every helper is an identity
 * function so call sites never need to branch — and `--json` output, which
 * never routes through these helpers, stays clean regardless.
 */
const colorEnabled = (): boolean => {
	if (process.env.NO_COLOR !== undefined) return false;
	const force = process.env.FORCE_COLOR;
	if (force !== undefined && force !== '0' && force !== 'false') return true;
	return Boolean(process.stdout.isTTY);
};

export const colorsEnabled = colorEnabled();

const wrap =
	(open: number, close: number) =>
	(value: string | number): string =>
		colorsEnabled ? `\x1b[${open}m${value}\x1b[${close}m` : String(value);

/** Raw palette — prefer the semantic `ui` helpers below for consistency. */
export const c = {
	bold: wrap(1, 22),
	dim: wrap(2, 22),
	red: wrap(31, 39),
	green: wrap(32, 39),
	yellow: wrap(33, 39),
	blue: wrap(34, 39),
	magenta: wrap(35, 39),
	cyan: wrap(36, 39),
	gray: wrap(90, 39)
};

/**
 * Semantic tones used across the CLI so the same kind of thing always reads
 * the same color: names in cyan, refs/tags in yellow, ids and metadata in
 * dim gray, outcomes in green/red.
 */
export const ui = {
	/** Primary human name of a project / board / page / task. */
	name: (value: string) => c.cyan(value),
	/** Short, tag-like handle: column refs, task refs. */
	ref: (value: string) => c.yellow(value),
	/** Record ids and other low-salience detail. */
	id: (value: string) => c.gray(value),
	/** Parenthetical counts and secondary metadata. */
	meta: (value: string) => c.dim(value),
	/** A successful create / update outcome. */
	success: (value: string) => c.green(value),
	/** A destructive outcome (delete). */
	removed: (value: string) => c.red(value),
	/** Warnings / cautions. */
	warn: (value: string) => c.yellow(value),
	/** Section headings / emphasis. */
	heading: (value: string) => c.bold(value),
	/** The active-item marker. */
	active: (value: string) => c.green(value)
};
