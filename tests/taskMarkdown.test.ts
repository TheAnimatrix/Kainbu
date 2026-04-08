import { describe, expect, it } from 'vitest';
import {
	applySlashCommand,
	getActiveMentionQuery,
	getActiveSlashQuery,
	hasLeadingCardCheckboxLine,
	insertReference,
	replaceAssetToken,
	stripLeadingCardCheckboxLine,
	stripAssetEmbeds,
	syncLeadingCardCheckboxLine,
	type TaskReferenceOption
} from '../src/lib/kainbu/taskMarkdown';

describe('taskMarkdown helpers', () => {
	it('detects active slash queries on the current line', () => {
		const value = 'Intro\n/image';
		expect(getActiveSlashQuery(value, value.length)).toEqual({
			start: 6,
			end: 12,
			query: 'image'
		});
	});

	it('detects active mention queries near the caret', () => {
		const value = 'Talk to @ali';
		expect(getActiveMentionQuery(value, value.length)).toEqual({
			start: 8,
			end: 12,
			query: 'ali'
		});
	});

	it('replaces a slash command line with the requested block scaffold', () => {
		const result = applySlashCommand('/h1', 3, 'heading-1');
		expect(result).toEqual({
			value: '# ',
			selectionStart: 2,
			selectionEnd: 2
		});
	});

	it('inserts references as markdown links', () => {
		const value = 'Talk to @ali about launch';
		const reference: TaskReferenceOption = {
			kind: 'member',
			id: 'user-1',
			label: 'Alice',
			description: 'Owner',
			searchText: 'alice owner'
		};

		const result = insertReference(value, 8, 12, reference);

		expect(result.value).toBe('Talk to [Alice](ref:member:user-1) about launch');
		expect(result.selectionStart).toBe(result.value.length - ' about launch'.length);
		expect(result.selectionEnd).toBe(result.selectionStart);
	});

	it('replaces pending asset tokens with persisted asset ids', () => {
		expect(replaceAssetToken('![Screenshot](asset:pending:123)', 'pending:123', 'asset-456')).toBe(
			'![Screenshot](asset:asset-456)'
		);
	});

	it('removes embedded asset markdown without disturbing surrounding content', () => {
		const value = 'Before\n![Screenshot](asset:asset-123)\nAfter\n![Keep](asset:asset-999)';
		expect(stripAssetEmbeds(value, 'asset-123')).toBe('Before\nAfter\n![Keep](asset:asset-999)');
	});

	it('detects and strips a leading checkbox line used as the card checkbox', () => {
		const value = '[ ] HELLO\n- [ ] hello';
		expect(hasLeadingCardCheckboxLine(value)).toBe(true);
		expect(stripLeadingCardCheckboxLine(value)).toBe('HELLO\n- [ ] hello');
	});

	it('syncs a leading standalone checkbox state without touching nested items', () => {
		const value = '[ ] HELLO\n- [ ] hello';
		expect(syncLeadingCardCheckboxLine(value, true)).toBe('[x] HELLO\n- [ ] hello');
	});

	it('treats a leading bullet checkbox line as the card checkbox too', () => {
		const value = '- [ ] HELLO\n- [ ] hello';
		expect(hasLeadingCardCheckboxLine(value)).toBe(true);
		expect(stripLeadingCardCheckboxLine(value)).toBe('HELLO\n- [ ] hello');
		expect(syncLeadingCardCheckboxLine(value, true)).toBe('- [x] HELLO\n- [ ] hello');
	});
});
