import {
	BACKGROUND_SIGNED_URL_TTL_SECONDS,
	BACKGROUND_STORAGE_BUCKET,
	buildBackgroundStoragePath
} from '$lib/kainbu/backgrounds';
import type { BackgroundTheme } from '$lib/kainbu/types';
import { supabase } from '$lib/supabaseClient';

export const uploadBackgroundImage = async (
	scope: 'user' | 'project',
	scopeId: string,
	file: File
): Promise<Extract<BackgroundTheme, { kind: 'image' }>> => {
	const path = buildBackgroundStoragePath(scope, scopeId, file.name, file.type);
	const { error } = await supabase.storage.from(BACKGROUND_STORAGE_BUCKET).upload(path, file, {
		contentType: file.type,
		cacheControl: '3600',
		upsert: false
	});

	if (error) throw error;

	return {
		kind: 'image',
		path
	};
};

export const deleteBackgroundImage = async (path: string) => {
	if (!path.trim()) return;

	const { error } = await supabase.storage.from(BACKGROUND_STORAGE_BUCKET).remove([path]);
	if (error) throw error;
};

export const createBackgroundSignedUrl = async (path: string) => {
	const { data, error } = await supabase.storage
		.from(BACKGROUND_STORAGE_BUCKET)
		.createSignedUrl(path, BACKGROUND_SIGNED_URL_TTL_SECONDS);

	if (error) throw error;

	return data.signedUrl;
};
