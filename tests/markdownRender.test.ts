import { describe, expect, it } from 'vitest';
import {
	collapseNestedTaskListStandaloneCheckboxes,
	normalizeStandaloneCheckboxBoundaries,
	stripMarkdownLite
} from '../src/lib/kainbu/markdown';

describe('markdown render cleanup', () => {
	it('collapses duplicate standalone checkbox markup nested inside a task list item', () => {
		const html =
			'<ul><li><input type="checkbox"><div class="kainbu-standalone-checkbox"><input type="checkbox"><span class="kainbu-standalone-checkbox__content">hello</span></div></li></ul>';

		expect(collapseNestedTaskListStandaloneCheckboxes(html)).toBe(
			'<ul><li><input type="checkbox"><span class="kainbu-standalone-checkbox__content">hello</span></li></ul>'
		);
	});

	it('strips markdown from trace previews', () => {
		expect(stripMarkdownLite('**Bold** and *italic* with `code`')).toBe('Bold and italic with code');
		expect(stripMarkdownLite('## Heading\n- list item')).toBe('Heading list item');
	});

	it('renders standalone checkbox lines even when they follow another block without a blank separator', () => {
		expect(
			normalizeStandaloneCheckboxBoundaries(
				'Plan better agentic workflow + Revamp\n[ ] how does the current one work'
			)
		).toBe('Plan better agentic workflow + Revamp\n\n[ ] how does the current one work');
	});
});
