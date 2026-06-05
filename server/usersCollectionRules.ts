import type PocketBase from 'pocketbase';
import { createAdminPb } from './pocketbase.js';

/** Must match pocketbase/pb_migrations/1730000010_admin_panel.js */
export const USERS_COLLECTION_API_RULES = {
	listRule: '@request.auth.is_admin = true || @request.auth.id = id',
	viewRule: '@request.auth.is_admin = true || @request.auth.id = id',
	updateRule: '@request.auth.id = id',
	deleteRule: '@request.auth.id = id',
	/** Never use `verified = true` here — it breaks API access for logged-in unverified users. */
	authRule: ''
} as const;

export type UsersCollectionRepairResult = {
	collectionId: string;
	viewRule: string | null;
	listRule: string | null;
	authRule: string | null;
};

/**
 * Restore users collection API rules. Partial Collections API updates can clear rules to null
 * (superuser-only), which surfaces as 404 for normal auth requests.
 */
export const repairUsersCollectionApiRules = async (
	pb?: PocketBase,
	extra: Record<string, unknown> = {}
): Promise<UsersCollectionRepairResult> => {
	const client = pb ?? (await createAdminPb());
	const collection = await client.collections.getOne('users');
	const before = {
		viewRule: collection.viewRule ?? null,
		listRule: collection.listRule ?? null,
		authRule: collection.authRule ?? null,
		authAlertEnabled: collection.authAlert?.enabled ?? null
	};

	await client.collections.update(collection.id, {
		...USERS_COLLECTION_API_RULES,
		authAlert: {
			...(collection.authAlert ?? {}),
			enabled: false
		},
		...extra
	});

	const after = await client.collections.getOne(collection.id);
	const result = {
		collectionId: collection.id,
		viewRule: after.viewRule ?? null,
		listRule: after.listRule ?? null,
		authRule: after.authRule ?? null
	};

	if (!result.viewRule || !result.listRule) {
		throw new Error(
			`users collection rules repair failed (viewRule=${String(result.viewRule)}, listRule=${String(result.listRule)})`
		);
	}

	if (
		before.viewRule !== result.viewRule ||
		before.listRule !== result.listRule ||
		before.authAlertEnabled !== false
	) {
		console.log('[users-rules] repaired users collection API rules', {
			before,
			after: result,
			authAlertEnabled: false
		});
	}

	return result;
};
