import { describe, expect, it } from 'vitest';
import { createPageSyncQueue } from '../src/lib/kainbu/syncQueue';

const initial = {
	projectId: 'p',
	pageId: 'page',
	previousContent: 'Original',
	content: 'First edit'
};

describe('pending edit recovery', () => {
	it('retains failed edits through serialization and retries from the original base', async () => {
		const queue = createPageSyncQueue();
		queue.set('p::page::page', initial);
		await expect(
			queue.flush('p::page::page', async () => {
				throw new Error('Offline');
			})
		).rejects.toThrow('Offline');
		const restored = createPageSyncQueue();
		for (const [key, value] of JSON.parse(JSON.stringify([...queue]))) restored.set(key, value);
		let saved = '';
		await restored.flush('p::page::page', async (entry) => {
			expect(entry.previousContent).toBe('Original');
			saved = entry.content;
		});
		expect(saved).toBe('First edit');
		expect(restored.size).toBe(0);
	});
	it('serializes overlapping flushes and rebases edits made during a write', async () => {
		const queue = createPageSyncQueue();
		queue.set('key', initial);
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const calls: string[] = [];
		const first = queue.flush('key', async (entry) => {
			calls.push(`${entry.previousContent} -> ${entry.content}`);
			await gate;
		});
		queue.set('key', { ...initial, content: 'Second edit' });
		const overlapping = queue.flush('key', async () => {
			throw new Error('Concurrent writer');
		});
		release();
		await Promise.all([first, overlapping]);
		expect(calls).toEqual(['Original -> First edit', 'First edit -> Second edit']);
		expect(queue.size).toBe(0);
	});
	it('keeps the newer draft when the first write conflicts', async () => {
		const queue = createPageSyncQueue();
		queue.set('key', initial);
		let reject!: (reason: Error) => void;
		const first = queue.flush(
			'key',
			() =>
				new Promise((_, fail) => {
					reject = fail;
				})
		);
		queue.set('key', { ...initial, content: 'Newer draft' });
		reject(new Error('Conflict'));
		await expect(first).rejects.toThrow('Conflict');
		expect(queue.get('key')).toMatchObject({ previousContent: 'Original', content: 'Newer draft' });
	});
});
