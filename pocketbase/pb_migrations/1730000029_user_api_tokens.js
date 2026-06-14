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
 * API rules: all `null` (admin-only). The web UI and CLI both go through
 * Hono endpoints with the admin PocketBase client — never the PB SDK for
 * this collection.
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
				listRule: null,
				viewRule: null,
				createRule: null,
				updateRule: null,
				deleteRule: null,
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

		// Repair partial migrations: ensure fields, indexes, and admin-only rules.
		const fieldNames = new Set(tokens.fields.map((field) => field.name));
		let changed = false;

		const ensureRelation = (name, options) => {
			if (fieldNames.has(name)) return;
			tokens.fields.add(
				new RelationField({
					name,
					required: options.required,
					maxSelect: options.maxSelect,
					collectionId: options.collectionId,
					cascadeDelete: options.cascadeDelete ?? false
				})
			);
			fieldNames.add(name);
			changed = true;
		};

		const ensureText = (name, required, max) => {
			if (fieldNames.has(name)) return;
			tokens.fields.add(new TextField({ name, required, max }));
			fieldNames.add(name);
			changed = true;
		};

		const ensureDate = (name) => {
			if (fieldNames.has(name)) return;
			tokens.fields.add(new DateField({ name, required: false }));
			fieldNames.add(name);
			changed = true;
		};

		ensureRelation('user', {
			required: true,
			maxSelect: 1,
			collectionId: users.id,
			cascadeDelete: true
		});
		ensureText('name', true, 64);
		ensureText('token_hash', true, 128);
		ensureText('prefix', true, 16);
		ensureDate('last_used_at');
		ensureDate('expires_at');
		ensureDate('revoked_at');

		for (const key of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']) {
			if (tokens[key] !== null) {
				tokens[key] = null;
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
