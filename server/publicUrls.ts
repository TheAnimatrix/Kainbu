import { getEnv } from './env.js';

/** Never send the API's internal PocketBase hostname to a browser. */
export const getPublicPocketBaseUrl = () => {
	const explicit = getEnv('VITE_POCKETBASE_URL');
	if (explicit) return explicit.replace(/\/+$/, '');
	return `${getEnv('KAINBU_PUBLIC_URL').replace(/\/+$/, '')}/pb`;
};
