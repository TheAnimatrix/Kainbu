import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
	createWorkspacePage,
	getPagesFingerprint,
	listWorkspacePages,
	setWorkspacePageContent,
	stripEditorTemplateFromContent
} from '../server/workspace-ai/sync';
import { buildBoardRefIndex } from '../server/workspace-ai/kanban-ops';
import type { KanbanData } from '../src/lib/kainbu/types';
import type { MaterializedWorkspace } from '../server/workspace-ai/sync';

const sampleKanban: KanbanData = [
	{ id: 'col-1', title: 'Todo', width: 268, tasks: [] }
];

const makeWorkspace = async (): Promise<MaterializedWorkspace> => {
	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pages-test-'));
	const boardFilePath = path.join(tempDir, 'current-board.json');
	const pageFilePath = path.join(tempDir, 'current-page.md');
	await fs.writeFile(boardFilePath, '[]', 'utf8');
	await fs.writeFile(pageFilePath, 'hello', 'utf8');
	const page = {
		id: 'page-1',
		name: 'Notes',
		content: 'hello',
		filePath: pageFilePath,
		originalContent: 'hello',
		baseRevision: 0,
		baseFingerprint: '',
		editCallCount: 0,
		position: 0
	};

	return {
		tempDir,
		projectId: 'project-1',
		board: {
			id: 'board-1',
			name: 'Main',
			kanbanData: structuredClone(sampleKanban),
			filePath: boardFilePath,
			originalContent: '[]',
			baseRevision: 0,
			baseFingerprint: '',
			editCallCount: 0,
			mutationCount: 0
		},
		page,
		pages: [page],
		pagesBaseFingerprint: getPagesFingerprint([page]),
		boardRefs: buildBoardRefIndex(sampleKanban, 'Main')
	};
};

describe('workspace AI pages', () => {
	it('stripEditorTemplateFromContent removes default template blocks', () => {
		const stripped = stripEditorTemplateFromContent(
			'## Notes\n- Add context\n- Link tasks with @\n- Use / for blocks\nReal content'
		);
		expect(stripped).toBe('Real content');
		expect(stripped).not.toContain('Add context');
	});

	it('create_page adds a page and list_pages returns it', async () => {
		const workspace = await makeWorkspace();
		const created = await createWorkspacePage(workspace, 'Ideas', '- item one');
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		const listed = listWorkspacePages(workspace);
		expect(listed.ok).toBe(true);
		if (!listed.ok) return;
		expect(listed.pages).toHaveLength(2);
		expect(listed.pages.some((entry) => entry.title === 'Ideas')).toBe(true);
	});

	it('set_page updates only the targeted page', async () => {
		const workspace = await makeWorkspace();
		await createWorkspacePage(workspace, 'Other', 'other body');
		const secondPage = workspace.pages.find((page) => page.name === 'Other');
		expect(secondPage).toBeDefined();
		if (!secondPage) return;

		const result = await setWorkspacePageContent(workspace, 'updated other', {
			pageId: secondPage.id
		});
		expect(result.ok).toBe(true);
		expect(workspace.pages.find((page) => page.id === 'page-1')?.content).toBe('hello');
		expect(workspace.pages.find((page) => page.id === secondPage.id)?.content).toBe(
			'updated other'
		);
	});
});
