import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { compile } from 'svelte/compiler';
import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';

const project = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(project, '../..');
const output = path.join(project, '.capture');
fs.mkdirSync(output, { recursive: true });
const dom = new JSDOM('', { url: 'http://127.0.0.1:4173' });
Object.assign(globalThis, {
	window: dom.window,
	document: dom.window.document,
	localStorage: dom.window.localStorage,
	DOMParser: dom.window.DOMParser,
	requestAnimationFrame: () => 0
});
DOMPurify.sanitize = DOMPurify(dom.window).sanitize;
// Rendering is offline. Fail if a reactive product hook tries to contact any service.
globalThis.fetch = async () => {
	throw new Error('Network is disabled while rendering product fixtures.');
};
const { columns, brief, pageDocument } = JSON.parse(
	fs.readFileSync(path.join(project, 'assets/example.json'), 'utf8')
);

await build({
	stdin: {
		contents: `export {default as Workspace} from './src/lib/components/WorkspaceShell.svelte'; export {render} from 'svelte/server'; export {EMPTY_PROJECT as createDefaultProject} from './src/lib/kainbu/constants.ts'; export {normalizeProjectStructure} from './src/lib/kainbu/projectStructure.ts';`,
		resolveDir: repo,
		sourcefile: 'film-entry.ts',
		loader: 'ts'
	},
	define: { 'import.meta.env': '{}' },
	bundle: true,
	platform: 'node',
	format: 'esm',
	packages: 'external',
	outfile: path.join(output, 'workspace.mjs'),
	alias: {
		$lib: path.join(repo, 'src/lib'),
		'@iconify/svelte': path.join(repo, 'node_modules/@iconify/svelte/dist/Icon.svelte')
	},
	loader: { '.png': 'dataurl', '.svg': 'dataurl' },
	plugins: [
		{
			name: 'offline-product-fixture',
			setup(bundler) {
				bundler.onResolve({ filter: /\?raw$/ }, ({ path: name, resolveDir }) => ({
					path: path.resolve(resolveDir, name.slice(0, -4)),
					namespace: 'film-raw'
				}));
				bundler.onLoad({ filter: /.*/, namespace: 'film-raw' }, ({ path: filename }) => ({
					contents: fs.readFileSync(filename, 'utf8'),
					loader: 'text'
				}));
				bundler.onResolve({ filter: /^\$app\// }, ({ path: name }) => ({
					path: name,
					namespace: 'film-app'
				}));
				bundler.onLoad({ filter: /.*/, namespace: 'film-app' }, ({ path: name }) => ({
					resolveDir: repo,
					contents:
						name === '$app/environment'
							? 'export const browser=false; export const dev=false;'
							: name === '$app/stores'
								? `import {readable} from 'svelte/store'; export const page=readable({url:new URL('http://localhost/')});`
								: 'export const goto=async()=>{}; export const replaceState=()=>{};'
				}));
				bundler.onLoad({ filter: /\.svelte$/ }, ({ path: filename }) => {
					let component = fs.readFileSync(filename, 'utf8');
					if (filename.endsWith('WorkspaceShell.svelte')) {
						// Seed only runtime state. The complete product template remains untouched.
						component = component.replace(
							'const pingBoardPresence = async () => {',
							'const pingBoardPresence = async () => { return;'
						);
						component = component.replace(
							'const loadAiModels = async () => {',
							'const loadAiModels = async () => { return;'
						);
						component = component.replace(
							'fetchPageAssets(currentProject.id, currentPage.id)',
							'Promise.resolve([])'
						);
						component = component.replace(
							'<script lang="ts">',
							'<script lang="ts">\n export let fixture;'
						);
						for (const [from, to] of [
							[
								'let user: AuthUser | null = null;',
								'let user: AuthUser | null = {id:"film-user"};'
							],
							['let projects: Project[] = [];', 'let projects: Project[] = [fixture.project];'],
							["let currentProjectId = '';", 'let currentProjectId = fixture.project.id;'],
							[
								"let desktopWorkspaceTab: WorkspaceTab = 'dashboard';",
								'let desktopWorkspaceTab: WorkspaceTab = fixture.view;'
							],
							[
								"let mobileTab: WorkspaceTab = 'dashboard';",
								'let mobileTab: WorkspaceTab = fixture.view;'
							],
							['let authHydrating = true;', 'let authHydrating = false;'],
							['let desktopChatCollapsed = true;', 'let desktopChatCollapsed = !fixture.chatOpen;'],
							['let viewportWidth = 0;', 'let viewportWidth = fixture.width;']
						]) {
							if (!component.includes(from))
								throw new Error(`Product fixture seed changed: ${from}`);
							component = component.replace(from, to);
						}
					}
					if (filename.endsWith('KanbanBoard.svelte'))
						component = component.replace(
							'let viewportWidth = 0;',
							'let viewportWidth = Number(globalThis.__filmWidth);'
						);
					const result = compile(component, { filename, generate: 'server', css: 'injected' });
					return { contents: result.js.code, loader: 'js', resolveDir: path.dirname(filename) };
				});
			}
		}
	]
});
const { Workspace, render, createDefaultProject, normalizeProjectStructure } = await import(
	pathToFileURL(path.join(output, 'workspace.mjs'))
);
const captured = {};
for (const [device, width] of [
	['desktop', 1200],
	['phone', 360]
]) {
	globalThis.__filmWidth = width;
	const sample = createDefaultProject('film-user', 'Kainbu');
	Object.assign(sample, { id: 'kainbu-demo', name: 'Kainbu', members: [], chatHistory: [] });
	const data = structuredClone(columns);
	for (const column of data) column.width = device === 'phone' ? 300 : 268;
	Object.assign(sample, {
		kanbanData: data,
		boards: [
			{
				id: 'launch',
				name: 'Website launch',
				kanbanData: data,
				preferences: {
					defaultShowCheckbox: true,
					moveCheckedTasks: true,
					checkedTaskTargetColumnId: 'done'
				},
				createdAt: 1780000000000,
				updatedAt: 1780000000000
			}
		],
		activeBoardId: 'launch',
		pages: [
			{
				id: 'brief',
				name: 'The launch brief',
				content: brief,
				createdAt: 1780000000000,
				updatedAt: 1780000000000
			}
		],
		activePageId: 'brief'
	});
	for (const [scene, view, chatOpen] of [
		['board', 'kanban', false],
		['board-chat', 'kanban', true],
		['page', 'scratchpad', false],
		['chat', device === 'phone' ? 'chat' : 'scratchpad', true]
	]) {
		const rendered = render(Workspace, {
			props: { fixture: { project: normalizeProjectStructure(sample), width, view, chatOpen } }
		});
		const fragment = JSDOM.fragment(rendered.body);
		if (view === 'scratchpad') {
			const surface = fragment.querySelector('.markdown-editor__surface > div');
			if (surface) surface.innerHTML = pageDocument;
		}
		const holder = document.createElement('div');
		holder.append(fragment);
		captured[`${device}-${scene}`] = { html: holder.innerHTML, head: rendered.head };
	}
}
fs.writeFileSync(
	path.join(project, 'assets/workspace-snapshots.json'),
	JSON.stringify(captured, null, 2)
);
dom.window.close();
console.log('Captured the complete, unmodified workspace template in desktop and phone states.');
