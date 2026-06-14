export const normalizeUsernameValue = (value: string | null | undefined) =>
	typeof value === 'string' && value.trim().length ? value.trim() : null;
