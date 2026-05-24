import { describe, expect, it } from 'vitest';
import {
	convertMarkdownTableListCells,
	enhanceTableCellLists,
	joinContinuedTableRows
} from '../src/lib/kainbu/markdown';

const multilineTable = `| Area | Tasks |
|------|-------|
| Tasks | - "linked tasks: show existing / dont show"
- "linked tasks: create from existing"
- "Card linking feature" |`;

describe('markdown table lists', () => {
	it('joins continued table rows', () => {
		const joined = joinContinuedTableRows(multilineTable);
		const dataRows = joined
			.split('\n')
			.filter((line) => line.trim().startsWith('| Tasks |'));
		expect(dataRows).toHaveLength(1);
		expect(dataRows[0]).toContain('<br>');
		expect(dataRows[0]).toContain('Card linking feature');
	});

	it('converts list cells in pipe tables', () => {
		const joined = joinContinuedTableRows(multilineTable);
		const converted = convertMarkdownTableListCells(joined);
		expect(converted).toContain('kainbu-cell-list');
		expect(converted).toContain('<li>');
		expect(converted).toContain('linked tasks: create from existing');
	});

	it('renders lists inside HTML tables', () => {
		expect(enhanceTableCellLists('<td>- a\n- b</td>')).toContain('kainbu-cell-list');
		expect(enhanceTableCellLists('<td>- a<br>- b</td>')).toContain('<li>');
	});
});
