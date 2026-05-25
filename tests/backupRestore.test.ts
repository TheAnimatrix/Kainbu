import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseProjectsImport } from '../src/lib/kainbu/backup';
import { EMPTY_PROJECT } from '../src/lib/kainbu/constants';
import { normalizeProjectStructure } from '../src/lib/kainbu/projectStructure';

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
		accessRole: 'owner' as const
	};
	return normalizeProjectStructure(seed);
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

	it('createProject seed merge keeps every imported board', async () => {
		const raw = readFileSync('k:/Downloads/kainbu-backup-2026-05-25.json', 'utf8');
		const calur = (await parseProjectsImport(new MockFile(raw) as unknown as File, 'user-1')).find(
			(project) => project.name === 'Calur'
		);
		if (!calur) throw new Error('missing Calur');

		const merged = mergeCreateProjectSeed('user-1', calur.name, calur);
		expect(merged.boards).toHaveLength(2);
		expect(merged.boards.map((board) => board.id)).toEqual(calur.boards.map((board) => board.id));
	});
});
