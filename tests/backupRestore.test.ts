import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	backupPayloadUsesContentOnlyKeys,
	exportProjectsToFile,
	parseProjectsImport
} from '../src/lib/kainbu/backup';
import { EMPTY_PROJECT } from '../src/lib/kainbu/constants';
import { normalizeProjectStructure } from '../src/lib/kainbu/projectStructure';
import type { Project } from '../src/lib/kainbu/types';

class MockFile {
	constructor(private content: string) {}

	text() {
		return Promise.resolve(this.content);
	}
}

/** Mirrors createProject() seed merge in persistence.ts */
const mergeCreateProjectSeed = (
	userId: string,
	name: string,
	seedProject?: Parameters<typeof normalizeProjectStructure>[0]
) => {
	const seed = {
		...normalizeProjectStructure(EMPTY_PROJECT(userId, name)),
		...(seedProject || {}),
		name: seedProject?.name || name,
		ownerUserId: userId,
		accessRole: 'owner' as const,
		boards: seedProject?.boards?.length ? seedProject.boards : undefined,
		pages: seedProject?.pages?.length ? seedProject.pages : undefined
	};
	return normalizeProjectStructure(seed as Project);
};

describe('backup restore', () => {
	it('parseProjectsImport preserves all projects and multi-board projects', async () => {
		const raw = readFileSync('k:/Downloads/kainbu-backup-2026-05-25.json', 'utf8');
		const projects = await parseProjectsImport(new MockFile(raw) as unknown as File, 'user-1');
		expect(projects).toHaveLength(8);
		const calur = projects.find((project) => project.name === 'Calur');
		expect(calur?.boards).toHaveLength(2);
		expect(calur?.boards.map((board) => board.name)).toEqual(['Board', 'Board 2']);
	});

	it('assigns fresh ids when importing legacy backups that still contain ids', async () => {
		const raw = readFileSync('k:/Downloads/kainbu-backup-2026-05-25.json', 'utf8');
		const legacy = JSON.parse(raw) as { projects: Array<{ boards: Array<{ id: string }> }> };
		const legacyBoardId = legacy.projects.find((p) => p.boards.length > 1)?.boards[0]?.id;
		expect(legacyBoardId).toBeTruthy();

		const imported = await parseProjectsImport(new MockFile(raw) as unknown as File, 'user-1');
		const calur = imported.find((project) => project.name === 'Calur');
		expect(calur?.boards[0]?.id).not.toBe(legacyBoardId);
	});

	it('createProject seed merge keeps every imported board', async () => {
		const raw = readFileSync('k:/Downloads/kainbu-backup-2026-05-25.json', 'utf8');
		const calur = (await parseProjectsImport(new MockFile(raw) as unknown as File, 'user-1')).find(
			(project) => project.name === 'Calur'
		);
		if (!calur) throw new Error('missing Calur');

		const merged = mergeCreateProjectSeed('user-1', calur.name, calur);
		expect(merged.boards).toHaveLength(2);
	});

	it('round-trip export uses content-only keys (no persisted ids)', async () => {
		const seed = normalizeProjectStructure(EMPTY_PROJECT('user-1', 'Round trip'));
		const payload = {
			version: 3 as const,
			projects: [
				{
					name: seed.name,
					boards: seed.boards.map((board, index) => ({
						name: board.name,
						position: index,
						kanbanData: board.kanbanData.map((column) => ({
							title: column.title,
							width: column.width,
							tasks: column.tasks.map((task) => ({
								title: task.title,
								description: task.description,
								tags: task.tags.map((tag) => ({ label: tag.label, color: tag.color }))
							}))
						}))
					})),
					pages: seed.pages.map((page, index) => ({
						name: page.name,
						position: index,
						content: page.content
					}))
				}
			]
		};

		expect(backupPayloadUsesContentOnlyKeys(payload)).toBe(true);
		expect(exportProjectsToFile).toBeTypeOf('function');
	});
});
