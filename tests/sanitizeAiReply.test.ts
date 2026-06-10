import { describe, expect, it } from 'vitest';
import { sanitizeUserFacingAiReply, stripInternalAiMarkup } from '../src/lib/kainbu/sanitizeAiReply';

describe('sanitizeAiReply', () => {
	it('strips nested DSML tool call markup from assistant replies', () => {
		const raw = [
			'<|DSML||tool_calls>',
			'<|DSML||invoke name="delete_tasks">',
			'<|DSML||parameter name="taskRefs" string="false">',
			'["T20","T21"]',
			'</|DSML||parameter>',
			'</|DSML||invoke>',
			'</|DSML||tool_calls>',
			'',
			'Review the staged change below, then apply it to save it to the project.'
		].join('\n');

		expect(stripInternalAiMarkup(raw)).toBe(
			'Review the staged change below, then apply it to save it to the project.'
		);
	});

	it('removes orphan DSML tags', () => {
		expect(stripInternalAiMarkup('Hello <|DSML||tool_calls> world')).toBe('Hello  world');
	});

	it('still strips internal task refs from sanitized replies', () => {
		expect(sanitizeUserFacingAiReply('Updated task (taskRef:T20).')).toBe('Updated task .');
	});

	it('collapses blank lines between consecutive markdown list items', () => {
		const raw = ['Intro', '', '- first item', '', '', '- second item', '', 'Outro'].join('\n');
		expect(sanitizeUserFacingAiReply(raw)).toBe(
			['Intro', '', '- first item', '- second item', '', 'Outro'].join('\n')
		);
	});
});
