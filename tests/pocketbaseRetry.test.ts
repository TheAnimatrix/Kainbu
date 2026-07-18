import { describe, expect, it, vi } from 'vitest';
import PocketBase, { ClientResponseError } from 'pocketbase';
import { isSafeAdminRetryMethod, withAdminAuthRetry } from '../server/pocketbase';

const authFailure = () => new ClientResponseError({ status: 401, response: { status: 401 } } as never);

type FakeCollection = Record<string, (...args: unknown[]) => Promise<unknown>>;

type FakeClient = {
	authStore: { save: ReturnType<typeof vi.fn> };
	collection: (name: string) => FakeCollection;
};

const fakeClient = (collection: FakeCollection): FakeClient => ({
	authStore: { save: vi.fn() },
	collection: () => collection
});

describe('server PocketBase auth retry', () => {
	it('only classifies reads and auth refresh as replay-safe', () => {
		expect(isSafeAdminRetryMethod('getFullList')).toBe(true);
		expect(isSafeAdminRetryMethod('getFirstListItem')).toBe(true);
		expect(isSafeAdminRetryMethod('authRefresh')).toBe(true);
		expect(isSafeAdminRetryMethod('create')).toBe(false);
		expect(isSafeAdminRetryMethod('update')).toBe(false);
		expect(isSafeAdminRetryMethod('delete')).toBe(false);
	});

	it('refreshes and retries a failed read, but never replays a failed mutation', async () => {
		const initialRead = vi.fn(async () => {
			throw authFailure();
		});
		const freshRead = vi.fn(async () => [{ id: 'project-1' }]);
		const freshClient = fakeClient({ getFullList: freshRead });
		const readClient = fakeClient({ getFullList: initialRead });
		const retriedRead = withAdminAuthRetry(
			readClient as unknown as PocketBase,
			() => freshClient as unknown as PocketBase,
			async () => 'fresh-token'
		);

		await expect(retriedRead.collection('projects').getFullList()).resolves.toEqual([{ id: 'project-1' }]);
		expect(initialRead).toHaveBeenCalledTimes(1);
		expect(freshRead).toHaveBeenCalledTimes(1);

		for (const method of ['create', 'update', 'delete'] as const) {
			const mutation = vi.fn(async () => {
				throw authFailure();
			});
			const mutationClient = fakeClient({ [method]: mutation });
			const freshMutationFn = vi.fn(async () => ({ id: 'must-not-exist' }));
			const freshMutation = fakeClient({ [method]: freshMutationFn });
			const retriedMutation = withAdminAuthRetry(
				mutationClient as unknown as PocketBase,
				() => freshMutation as unknown as PocketBase,
				async () => 'fresh-token'
			);

			const collection = (retriedMutation as unknown as {
				collection: (name: string) => Record<string, (...args: unknown[]) => Promise<unknown>>;
			}).collection('projects');
			await expect(collection[method]('record-1')).rejects.toBeInstanceOf(ClientResponseError);
			expect(mutation).toHaveBeenCalledTimes(1);
			expect(freshMutationFn).not.toHaveBeenCalled();
		}
	});
});
