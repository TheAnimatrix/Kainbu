export const VERIFICATION_RESEND_COOLDOWN_SECONDS = 120;

const storageKey = (email: string) =>
	`kainbu:verification-resend:${email.trim().toLowerCase()}`;

export const normalizeVerificationEmail = (email: string): string => email.trim().toLowerCase();

export const isAuthRecordUnverified = (model: unknown): boolean => {
	if (!model || typeof model !== 'object') return false;
	return (model as { verified?: boolean }).verified === false;
};

export const getVerificationResendCooldownRemaining = (email: string): number => {
	const normalized = normalizeVerificationEmail(email);
	if (!normalized || typeof localStorage === 'undefined') return 0;

	const raw = localStorage.getItem(storageKey(normalized));
	if (!raw) return 0;

	const sentAt = Number(raw);
	if (!Number.isFinite(sentAt)) return 0;

	const elapsedMs = Date.now() - sentAt;
	const cooldownMs = VERIFICATION_RESEND_COOLDOWN_SECONDS * 1000;
	const remainingMs = cooldownMs - elapsedMs;
	if (remainingMs <= 0) return 0;

	return Math.ceil(remainingMs / 1000);
};

export const markVerificationResendSent = (email: string): void => {
	const normalized = normalizeVerificationEmail(email);
	if (!normalized || typeof localStorage === 'undefined') return;
	localStorage.setItem(storageKey(normalized), String(Date.now()));
};
