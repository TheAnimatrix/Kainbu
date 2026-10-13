import { describe, expect, it } from 'vitest';
import {
	collapseNestedTaskListStandaloneCheckboxes,
	isHtmlDocument,
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

describe('isHtmlDocument', () => {
	it('keeps markdown with angle-bracket placeholders as markdown', () => {
		const description = [
			'Answer: yes. `tscram --gen-openram` is the generator.',
			'',
			'Thin wrapper: `lab/gds2/openram_big_20261012/logs/gen2.sh <NAME> <DECL> <WPR> [--openram-set ...]`.',
			'',
			'- packet: `checks/check_packet.py`',
			'- model: `checks/run_model_behavior.py`'
		].join('\n');
		expect(isHtmlDocument(description)).toBe(false);
		expect(isHtmlDocument('Run `cmd <arg>` then\n\n```sh\necho <b>hi</b>\n```')).toBe(false);
		expect(isHtmlDocument('Use gen.sh <NAME> to build')).toBe(false);
		expect(isHtmlDocument('<p>intro</p>\n\nThen **markdown** below')).toBe(false);
	});

	it('detects documents made entirely of HTML blocks', () => {
		expect(isHtmlDocument('<h1>Title</h1>\n<p>Body <strong>bold</strong></p>')).toBe(true);
		expect(isHtmlDocument('<p>one</p>\n\n<ul><li>two</li></ul>\n')).toBe(true);
	});

	it('treats empty input as not HTML', () => {
		expect(isHtmlDocument('')).toBe(false);
		expect(isHtmlDocument('  \n\n ')).toBe(false);
	});
});
