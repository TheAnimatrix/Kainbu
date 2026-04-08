import { describe, expect, it } from 'vitest';
import {
	collapseNestedTaskListStandaloneCheckboxes,
	normalizeStandaloneCheckboxBoundaries
} from '../src/lib/kainbu/markdown';

describe('markdown render cleanup', () => {
	it('collapses duplicate standalone checkbox markup nested inside a task list item', () => {
		const html =
			'<ul><li><input type="checkbox"><div class="kainbu-standalone-checkbox"><input type="checkbox"><span class="kainbu-standalone-checkbox__content">hello</span></div></li></ul>';

		expect(collapseNestedTaskListStandaloneCheckboxes(html)).toBe(
			'<ul><li><input type="checkbox"><span class="kainbu-standalone-checkbox__content">hello</span></li></ul>'
		);
	});

	it('renders standalone checkbox lines even when they follow another block without a blank separator', () => {
		expect(
			normalizeStandaloneCheckboxBoundaries(
				'Plan better agentic workflow + Revamp\n[ ] how does the current one work'
			)
		).toBe('Plan better agentic workflow + Revamp\n\n[ ] how does the current one work');
	});
});
