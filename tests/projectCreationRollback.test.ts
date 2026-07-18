import { describe, expect, it, vi } from 'vitest';
import { runProjectInitialization } from '../src/lib/kainbu/projectCreationTransaction';

describe('project initialization rollback', () => {
	it('rolls back after an early membership/initialization failure', async () => {
		const originalFailure = new Error('membership write failed');
		const rollback = vi.fn(async () => undefined);

		await expect(
			runProjectInitialization(async () => {
				throw originalFailure;
			}, rollback)
		).rejects.toBe(originalFailure);
		expect(rollback).toHaveBeenCalledTimes(1);
	});

	it('rolls back after a late initialization failure and preserves both failures', async () => {
		const initializationFailure = new Error('AI state write failed');
		const rollbackFailure = new Error('rollback delete failed');
		const rollback = vi.fn(async () => {
			throw rollbackFailure;
		});

		await expect(
			runProjectInitialization(async () => {
				throw initializationFailure;
			}, rollback)
		).rejects.toSatisfy((error: unknown) => {
			if (!(error instanceof AggregateError)) return false;
			return error.errors.includes(initializationFailure) && error.errors.includes(rollbackFailure);
		});
		expect(rollback).toHaveBeenCalledTimes(1);
	});
});
