import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { pocketbase } from '$lib/pocketbaseClient';
import { fetchAdminMe } from '$lib/kainbu/adminApi';

export const prerender = false;
export const ssr = false;

export const load = async () => {
	if (!browser) {
		return { isAdmin: false, email: '' };
	}

	if (!pocketbase.authStore.isValid) {
		throw redirect(303, '/');
	}

	try {
		const me = await fetchAdminMe();
		if (!me.isAdmin) {
			throw redirect(303, '/');
		}
		return { isAdmin: true, email: me.email };
	} catch (error) {
		if (error && typeof error === 'object' && 'status' in error && error.status === 303) {
			throw error;
		}
		throw redirect(303, '/');
	}
};
