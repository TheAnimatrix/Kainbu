import { ClientResponseError } from 'pocketbase';

export const isPocketBaseNotFound = (error: unknown): boolean =>
	error instanceof ClientResponseError && error.status === 404;

/** Prod schema bug: a custom text `id` field on project_pages shadows the record id and rejects creates. */
export const isProjectPagesStrayIdFieldError = (error: unknown): boolean => {
	if (!(error instanceof ClientResponseError) || error.status !== 400) return false;
	const data = error.response?.data as Record<string, unknown> | undefined;
	const idError = data?.id;
	return (
		typeof idError === 'object' &&
		idError !== null &&
		'code' in idError &&
		(idError as { code: unknown }).code === 'validation_required'
	);
};

/** 404 on the signed-in user's own users record — stale token or deleted account. */
export const isOwnUserRecordNotFound = (error: unknown, userId: string): boolean => {
	if (!isPocketBaseNotFound(error) || !userId) return false;
	const encoded = encodeURIComponent(userId);
	return (
		(error as ClientResponseError).url?.includes(`/users/records/${encoded}`) ||
		(error as ClientResponseError).url?.includes(`/users/records/${userId}`)
	);
};

const AUTH_FIELD_LABELS: Record<string, string> = {
	identity: 'Email',
	email: 'Email',
	password: 'Password',
	passwordConfirm: 'Password confirmation'
};

const formatAuthFieldMessage = (field: string, message: string): string => {
	const label = AUTH_FIELD_LABELS[field] ?? field.charAt(0).toUpperCase() + field.slice(1);
	const trimmed = message.trim();
	if (/^cannot be blank\.?$/i.test(trimmed)) {
		return `${label} cannot be blank.`;
	}
	if (/^(must|missing|invalid) /i.test(trimmed)) {
		return `${label} ${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`;
	}
	if (trimmed.toLowerCase().startsWith(label.toLowerCase())) {
		return trimmed;
	}
	return `${label}: ${trimmed}`;
};

const collectPocketBaseFieldMessages = (value: unknown, field = ''): string[] => {
	if (typeof value === 'string' && value.trim()) {
		return field ? [formatAuthFieldMessage(field, value)] : [value.trim()];
	}

	if (!value || typeof value !== 'object') {
		return [];
	}

	if ('message' in value && typeof (value as { message: unknown }).message === 'string') {
		const message = String((value as { message: string }).message);
		if (field === 'email' && /already exists|not unique|unique/i.test(message)) {
			return ['An account with that email already exists. Sign in instead.'];
		}
		return field ? [formatAuthFieldMessage(field, message)] : [message];
	}

	return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => {
		if (key === 'message') return [];
		return collectPocketBaseFieldMessages(nested, key);
	});
};

/** Surface PocketBase validation / rule errors instead of generic "Failed to create record." */
export function formatPocketBaseError(error: unknown, fallback: string): string {
	if (!(error instanceof ClientResponseError)) {
		if (error instanceof Error) {
			const message = error.message.trim();
			if (/already exists|not unique|unique/i.test(message)) {
				return 'An account with that email already exists. Sign in instead.';
			}
			return message || fallback;
		}
		return fallback;
	}

	const data = error.response?.data as Record<string, unknown> | undefined;
	if (data && typeof data === 'object') {
		const fieldMessages = collectPocketBaseFieldMessages(data);
		if (fieldMessages.length) return fieldMessages.join(' ');
	}

	const message = error.message.trim();
	if (/already exists|not unique|unique/i.test(message)) {
		return 'An account with that email already exists. Sign in instead.';
	}

	return message || fallback;
}
