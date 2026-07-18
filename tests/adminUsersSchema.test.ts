import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = new URL(
	'../pocketbase/pb_migrations/1730000036_admin_users_schema_repair.js',
	import.meta.url
);
const migration = readFileSync(migrationPath, 'utf8');

describe('admin users schema repair migration', () => {
	it('has a unique forward timestamp after the current migration tip', () => {
		expect(migrationPath.pathname).toContain('1730000036');
		expect(migrationPath.pathname).not.toContain('1730000034');
		expect(migrationPath.pathname).not.toContain('1730000035');
	});

	it('adds an optional bool field only when missing and repairs malformed fields', () => {
		expect(migration).toContain("users.fields.getByName('is_admin')");
		expect(migration).toContain("new BoolField({ name: 'is_admin', required: false })");
		expect(migration).toContain("isAdmin.type !== 'bool'");
		expect(migration).toContain('users.fields.removeById(isAdmin.id)');
		expect(migration).toContain('() => {}');
	});
});
