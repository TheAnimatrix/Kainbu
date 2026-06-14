import { describe, expect, it } from 'vitest';
import { timingSafeEqual } from 'node:crypto';
import { generateApiToken, hashApiToken, looksLikeApiToken, maskApiToken } from '../server/apiKeys.js';

describe('API token generation + hashing', () => {
	it('produces a token with the kbu_v1_ prefix', () => {
		const { raw, prefix, hash } = generateApiToken();
		expect(raw.startsWith('kbu_v1_')).toBe(true);
		expect(prefix.startsWith('kbu_v1_')).toBe(true);
		expect(raw.length).toBeGreaterThan(40);
		// The prefix is the head ("kbu_v1_", 7 chars) + 6 body chars = 13,
		// comfortably under the collection's 16-char limit.
		expect(prefix.length).toBeLessThanOrEqual(16);
		// The hash is sha-256 hex = 64 chars
		expect(hash).toHaveLength(64);
	});

	it('hashes deterministically with sha-256', () => {
		const a = hashApiToken('kb_abcdefghijklmnopqrstuvwxyz012345');
		const b = hashApiToken('kb_abcdefghijklmnopqrstuvwxyz012345');
		const c = hashApiToken('kb_abcdefghijklmnopqrstuvwxyz012346');
		expect(a).toBe(b);
		expect(a).not.toBe(c);
	});

	it('two consecutive tokens are different', () => {
		const a = generateApiToken();
		const b = generateApiToken();
		expect(a.raw).not.toBe(b.raw);
		expect(a.hash).not.toBe(b.hash);
	});

	it('constant-time hex compare is the building block we use for lookup', () => {
		const a = hashApiToken('kb_x');
		const b = hashApiToken('kb_x');
		const c = hashApiToken('kb_y');
		expect(timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))).toBe(true);
		expect(timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(c, 'hex'))).toBe(false);
	});

	it('maskApiToken keeps the prefix and adds an ellipsis', () => {
		expect(maskApiToken('kbu_v1_abcd12')).toBe('kbu_v1_abcd12…');
		expect(maskApiToken('')).toBe('…');
	});

	it('looksLikeApiToken matches the kbu_ stem, including future versions', () => {
		expect(looksLikeApiToken(generateApiToken().raw)).toBe(true);
		expect(looksLikeApiToken('kbu_v2_whatever')).toBe(true);
		// JWTs and other bearers must not be misrouted to the API-key resolver.
		expect(looksLikeApiToken('eyJhbGciOiJIUzI1NiJ9.payload.sig')).toBe(false);
		expect(looksLikeApiToken('kb_old_style')).toBe(false);
	});
});
