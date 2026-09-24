import { describe, expect, it } from 'vitest';
import { deriveToolActivities } from '../src/lib/kainbu/aiActivity';
import type { AiProgressEvent } from '../src/lib/kainbu/types';

const event = (
	id: string,
	kind: AiProgressEvent['kind'],
	message: string,
	detail?: string
): AiProgressEvent => ({ id, kind, message, detail, timestamp: 1 });

describe('deriveToolActivities', () => {
	it('only marks a live call complete after its matching result arrives', () => {
		const call = event('call-1', 'tool_call', 'Read the board', '{"limit":20}');

		expect(deriveToolActivities([call], true)).toEqual([
			{
				id: 'call-1',
				label: 'Read the board',
				input: '{"limit":20}',
				state: 'running'
			}
		]);

		expect(
			deriveToolActivities(
				[call, event('result-1', 'tool_result', 'Found 6 tasks', '{"ok":true}')],
				true
			)
		).toEqual([
			{
				id: 'call-1',
				label: 'Read the board',
				input: '{"limit":20}',
				result: 'Found 6 tasks',
				resultDetail: '{"ok":true}',
				state: 'completed'
			}
		]);
	});

	it('uses an explicit failed result rather than guessing from the call label', () => {
		const activities = deriveToolActivities(
			[
				event('call-1', 'tool_call', 'Update the board'),
				event(
					'result-1',
					'tool_result',
					'Permission denied',
					'{"ok":false,"error":"Permission denied"}'
				)
			],
			true
		);

		expect(activities[0]?.state).toBe('error');
	});

	it('recognizes an explicit failure in a truncated result', () => {
		const activities = deriveToolActivities(
			[
				event('call-1', 'tool_call', 'Update the page'),
				event('result-1', 'tool_result', 'Failed', '{"ok":false,"error":"A long error')
			],
			true
		);

		expect(activities[0]?.state).toBe('error');
	});

	it('does not describe an unpaired historical call as completed or running', () => {
		expect(
			deriveToolActivities([event('call-1', 'tool_call', 'Read the page')], false)[0]?.state
		).toBe('unresolved');
	});

	it('pairs serial calls and results in event order', () => {
		const activities = deriveToolActivities(
			[
				event('call-1', 'tool_call', 'Read board'),
				event('result-1', 'tool_result', 'Board read', '{"ok":true}'),
				event('call-2', 'tool_call', 'Read page'),
				event('result-2', 'tool_result', 'Page failed', '{"ok":false}')
			],
			false
		);

		expect(activities.map(({ label, state }) => ({ label, state }))).toEqual([
			{ label: 'Read board', state: 'completed' },
			{ label: 'Read page', state: 'error' }
		]);
	});
});
