/// <reference path="../pb_data/types.d.ts" />

/**
 * Per-user API tokens (PATs) for the CLI / self-hosted-domain auth flow.
 *
 * Storage model:
 *  - The raw token is never stored. The server stores `token_hash` (sha-256 of
 *    the raw key, hex-encoded). The raw key is shown to the user once on
 *    creation and never recoverable after.
 *  - `prefix` is a short, non-secret display handle (`kbu_v1_` head plus the
 *    first few chars of the raw key) used in the settings UI to help users
 *    tell tokens apart.
 *  - `revoked_at` is a soft-delete marker. Revoked tokens are kept on disk
 *    so audit/usage data still resolves, but `resolveApiKeyUser` rejects
 *    them.
 *
 * API rules:
 *  - `listRule` / `viewRule` / `deleteRule` = owner-only
 *  - `createRule` / `updateRule` = `null` (server admin client only — the CLI
 *    and the web UI both go through Hono endpoints, never the PB SDK for
 *    this collection).
 */
migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');

		let tokens;
		try {
			tokens = app.findCollectionByNameOrId('user_api_tokens');
		} catch {
			tokens = new Collection({
				name: 'user_api_tokens',
				type: 'base',
				listRule: '@request.auth.id != "" && user.id = @request.auth.id',
				viewRule: '@request.auth.id != "" && user.id = @request.auth.id',
				createRule: null,
				updateRule: null,
				deleteRule: '@request.auth.id != "" && user.id = @request.auth.id',
				fields: [
					{
						name: 'user',
						type: 'relation',
						required: true,
						maxSelect: 1,
						collectionId: users.id,
						cascadeDelete: true
					},
					{ name: 'name', type: 'text', required: true, max: 64 },
					{ name: 'token_hash', type: 'text', required: true, max: 128 },
					{ name: 'prefix', type: 'text', required: true, max: 16 },
					{ name: 'last_used_at', type: 'date', required: false, max: 0 },
					{ name: 'expires_at', type: 'date', required: false, max: 0 },
					{ name: 'revoked_at', type: 'date', required: false, max: 0 }
				],
				indexes: [
					'CREATE UNIQUE INDEX idx_user_api_tokens_hash ON user_api_tokens (token_hash)',
					'CREATE INDEX idx_user_api_tokens_user ON user_api_tokens (user)'
				]
			});
			app.save(tokens);
		}

		// Repair: ensure rules + indexes are present even on partial migration.
		const expectedRules = {
			listRule: '@request.auth.id != "" && user.id = @request.auth.id',
			viewRule: '@request.auth.id != "" && user.id = @request.auth.id',
			createRule: null,
			updateRule: null,
			deleteRule: '@request.auth.id != "" && user.id = @request.auth.id'
		};

		let changed = false;
		for (const [key, value] of Object.entries(expectedRules)) {
			if (tokens[key] !== value) {
				tokens[key] = value;
				changed = true;
			}
		}

		const indexes = tokens.indexes || [];
		const hasHashIndex = indexes.some((entry) => String(entry).includes('idx_user_api_tokens_hash'));
		const hasUserIndex = indexes.some((entry) => String(entry).includes('idx_user_api_tokens_user'));
		const nextIndexes = [...indexes];
		if (!hasHashIndex) {
			nextIndexes.push('CREATE UNIQUE INDEX idx_user_api_tokens_hash ON user_api_tokens (token_hash)');
			changed = true;
		}
		if (!hasUserIndex) {
			nextIndexes.push('CREATE INDEX idx_user_api_tokens_user ON user_api_tokens (user)');
			changed = true;
		}
		if (changed) {
			tokens.indexes = nextIndexes;
			app.save(tokens);
		}
	},
	() => {}
);
