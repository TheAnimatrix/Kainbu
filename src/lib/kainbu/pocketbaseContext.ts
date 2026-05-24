import type PocketBase from 'pocketbase';

let pocketBaseClient: PocketBase | null = null;

export const setPocketBaseClient = (client: PocketBase) => {
	pocketBaseClient = client;
};

export const getPb = () => {
	if (!pocketBaseClient) {
		throw new Error('PocketBase client is not initialized.');
	}
	return pocketBaseClient;
};

export const isPocketBaseConfigured = () => Boolean(pocketBaseClient);
