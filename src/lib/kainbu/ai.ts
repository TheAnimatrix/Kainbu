import { invokeWorkspaceApi } from '$lib/kainbu/api';
import type { AiWorkspaceRequest, AiWorkspaceResponse } from '$lib/kainbu/types';

export const invokeWorkspaceAi = async (request: AiWorkspaceRequest) => {
	try {
		return await invokeWorkspaceApi<AiWorkspaceResponse>('/api/workspace-ai', {
			body: request
		});
	} catch (error) {
		if (error instanceof Error && error.message.includes('workspace actions')) {
			throw new Error('You need to sign in again before using AI.');
		}

		throw error;
	}
};
