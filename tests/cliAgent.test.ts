import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import PocketBase from 'pocketbase';
import type { KanbanData, Task } from '../src/lib/kainbu/types';

type CliData = Task & {
	schemaVersion: number;
	command: { commands: { name: string; options: { flags: string }[] }[] };
	profile: string;
	user: { id: string };
	task: Task;
	tasks: (Task & { ref: string; revision: string; columnId: string })[];
	revision: string;
	columnId: string;
	unchanged: boolean;
	total: number;
	content: string;
	pad: { content: string };
};
type Snapshot = {
	projects: {
		id: string;
		name: string;
		members?: { userId: string; username?: string; role: string }[];
		pages: { id: string; name: string; content: string }[];
		boards: { id: string; name: string; kanbanData: KanbanData }[];
	}[];
	incomingInvites: [];
};

const root = resolve(import.meta.dirname, '..');
let directory: string;
let base = '';
const key = 'kbu_v1_disposable_agent_test_key';
let server: Server;
let requests: {
	path: string;
	method: string;
	authorization?: string;
	body: { next: KanbanData };
}[];
let snapshot: Snapshot;
let failure = 0;

const run = <T = CliData>(
	args: string[],
	input?: string,
	env: NodeJS.ProcessEnv = {},
	cwd = directory
) =>
	new Promise<{
		code: number | null;
		stdout: string;
		stderr: string;
		data: T;
		error: { error: { code: string; message: string; status?: number } };
	}>((resolveResult, reject) => {
		const child = spawn(
			process.execPath,
			[join(root, 'packages/kainbu-cli/dist/index.js'), ...args],
			{
				cwd,
				windowsHide: true,
				env: {
					...process.env,
					KAINBU_CONFIG_DIR: directory,
					KAINBU_API_BASE: base,
					KAINBU_API_KEY: key,
					KAINBU_PROFILE: '',
					KAINBU_PROJECT: '',
					KAINBU_BOARD: '',
					FORCE_COLOR: '0',
					...env
				},
				stdio: ['pipe', 'pipe', 'pipe']
			}
		);
		let stdout = '',
			stderr = '';
		child.stdout.on('data', (chunk) => (stdout += chunk));
		child.stderr.on('data', (chunk) => (stderr += chunk));
		child.on('error', reject);
		const timer = setTimeout(() => {
			child.kill();
			reject(new Error('CLI hung: ' + args.join(' ')));
		}, 15_000);
		child.on('close', (code) => {
			clearTimeout(timer);
			try {
				resolveResult({
					code,
					stdout,
					stderr,
					data: stdout ? JSON.parse(stdout) : null,
					error: stderr ? JSON.parse(stderr) : null
				});
			} catch {
				reject(new Error('Non-JSON CLI output: ' + stdout + stderr));
			}
		});
		child.stdin.on('error', () => {});
		child.stdin.end(input);
	});

beforeAll(() => {
	const build = spawnSync(process.execPath, [join(root, 'node_modules/tsup/dist/cli-default.js')], {
		cwd: join(root, 'packages/kainbu-cli'),
		encoding: 'utf8',
		windowsHide: true
	});
	expect(build.status, build.stdout + build.stderr).toBe(0);
});
beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), 'kainbu-agent-'));
});
afterEach(async () => {
	if (resolve(directory).startsWith(resolve(tmpdir()) + sep + 'kainbu-agent-'))
		await rm(directory, { recursive: true, force: true });
});

describe('CLI automation protocol (real executable over HTTP)', () => {
	beforeAll(async () => {
		server = createServer(async (req, res) => {
			let raw = '';
			for await (const chunk of req) raw += chunk;
			const body = raw ? JSON.parse(raw) : undefined;
			requests.push({
				path: req.url!,
				method: req.method!,
				authorization: req.headers.authorization,
				body
			});
			res.setHeader('Content-Type', 'application/json');
			if (req.headers.authorization === 'Bearer slow') return;
			if (failure) {
				res.writeHead(failure);
				res.end(JSON.stringify({ error: 'Controlled failure' }));
				return;
			}
			if (req.url === '/api/me') {
				res.end(
					JSON.stringify({
						id:
							req.headers.authorization === 'Bearer saved_key_long_enough'
								? 'saved-user'
								: 'env-user',
						email: 'agent@kainbu.test',
						auth_method: 'api-key'
					})
				);
				return;
			}
			const path = req.url!.split('?')[0];
			if (path.startsWith('/api/workspace/tasks/comments')) {
				// An older server: Hono's plain-text 404 for an unknown route.
				res.setHeader('Content-Type', 'text/plain');
				res.writeHead(404);
				res.end('404 Not Found');
				return;
			}
			if (path === '/api/workspace/snapshot') {
				res.end(JSON.stringify(snapshot));
				return;
			}
			if (req.url === '/api/workspace/boards/sync')
				snapshot.projects[0].boards[0].kanbanData = body.next;
			res.end(JSON.stringify({ ok: true }));
		});
		await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
		base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
	});
	afterAll(async () => {
		server.closeAllConnections();
		await new Promise<void>((r) => server.close(() => r()));
	});
	beforeEach(() => {
		requests = [];
		failure = 0;
		snapshot = {
			projects: [
				{
					id: 'p1',
					name: 'Work',
					pages: [],
					boards: [
						{
							id: 'b1',
							name: 'Main',
							kanbanData: [
								{
									id: 'c1',
									title: 'Todo',
									tasks: [
										{
											id: 't1',
											title: 'Fix it',
											tags: [],
											checked: false,
											hasCheckbox: true,
											createdAt: 100,
											updatedAt: 100
										},
										{ id: 'gone', title: 'Deleted', tags: [], deletedAt: 100 }
									]
								},
								{ id: 'c2', title: 'Done', tasks: [] }
							]
						}
					]
				},
				{
					id: 'p2',
					name: 'Work archive',
					pages: [],
					boards: [{ id: 'b2', name: 'Other', kanbanData: [] }]
				},
				{
					id: 'empty',
					name: 'Empty',
					pages: [{ id: 'pg', name: 'Notes', content: 'hello' }],
					boards: []
				}
			],
			incomingInvites: []
		};
	});
	it('discovers the complete command/option tree without credentials', async () => {
		const result = await run(['schema'], undefined, { KAINBU_API_KEY: '' });
		expect(result.code).toBe(0);
		expect(result.stderr).toBe('');
		expect(result.data.schemaVersion).toBe(1);
		expect(
			result.data.command.commands
				.find((c) => c.name === 'ls')
				?.options.some((o) => o.flags === '--limit <n>')
		).toBe(true);
		expect(requests).toHaveLength(0);
	});
	it.each([
		[['task', 'add', '--json'], 'invalid_arguments'],
		[['--json', 'task', 'list', '--limit', 'NaN'], 'invalid_arguments'],
		[['task', 'list', '--offset', '-1', '--json'], 'invalid_arguments'],
		[['--json', 'unknown'], 'invalid_arguments'],
		[['login', '--device', '--json'], 'input_required'],
		[['setup', '--json'], 'input_required'],
		[['task', '--json'], 'invalid_arguments'],
		[['--json', 'task', 'update', 't1', '--checked', 'maybe'], 'invalid_arguments']
	])('fails invalid or interactive command %j with clean JSON', async (args, code) => {
		const result = await run(args);
		expect(result.stdout).toBe('');
		expect(result.code).toBe(2);
		expect(result.error.error.code).toBe(code);
		expect(requests).toHaveLength(0);
	});
	it('prints help for a bare invocation or command group outside a terminal', () => {
		const cli = (args: string[]) =>
			spawnSync(process.execPath, [join(root, 'packages/kainbu-cli/dist/index.js'), ...args], {
				cwd: directory,
				encoding: 'utf8',
				windowsHide: true,
				env: { ...process.env, KAINBU_CONFIG_DIR: directory, KAINBU_API_KEY: '', FORCE_COLOR: '0' }
			});
		const bare = cli([]);
		expect(bare.status).toBe(0);
		expect(bare.stdout).toContain('Usage: kainbu');
		expect(bare.stdout).toContain('setup');
		expect(bare.stderr).toBe('');
		const group = cli(['task']);
		expect(group.status).toBe(2);
		expect(group.stderr).toContain('Usage: kainbu task');
		expect(group.stderr).not.toContain('outputHelp');
		expect(requests).toHaveLength(0);
	});
	it('reads a piped API key, defaults the first profile, and does not print the secret', async () => {
		const result = await run(
			['login', '--server', base + '/', '--api-key', '-', '--json'],
			key + '\n',
			{ KAINBU_API_KEY: '' }
		);
		expect(result.code, result.stderr).toBe(0);
		expect(result.data.profile).toBe('default');
		expect(result.stdout + result.stderr).not.toContain(key);
		expect(requests[0].authorization).toBe('Bearer ' + key);
		const saved = JSON.parse(await readFile(join(directory, 'auth.json'), 'utf8'));
		expect(saved.profiles.default.apiKey).toBe(key);
		const again = await run(['login', '--server', base, '--api-key', '-', '--json'], key, {
			KAINBU_API_KEY: ''
		});
		expect(again.code).toBe(2);
		expect(again.error.error.code).toBe('input_required');
	});
	it('honors process credentials over .env and saved profiles without rewriting auth', async () => {
		await writeFile(
			join(directory, '.env'),
			'KAINBU_API_KEY=wrong\nKAINBU_API_BASE=http://127.0.0.1:1'
		);
		const auth = JSON.stringify({
			version: 1,
			activeProfile: 'saved',
			profiles: {
				saved: {
					name: 'saved',
					apiBase: base,
					apiKey: 'saved_key_long_enough',
					createdAt: '',
					lastUsedAt: null
				}
			}
		});
		await writeFile(join(directory, 'auth.json'), auth);
		const env = await run(['whoami', '--json']);
		expect(env.data.id).toBe('env-user');
		const selected = await run(['whoami', '--json', '--auth-profile', 'saved']);
		expect(selected.data.id).toBe('saved-user');
		expect(await readFile(join(directory, 'auth.json'), 'utf8')).toBe(auth);
		const mismatch = await run(['whoami', '--json'], undefined, {
			KAINBU_API_KEY: '',
			KAINBU_API_BASE: 'http://127.0.0.1:1'
		});
		expect(mismatch.error.error.code).toBe('invalid_config');
	});
	it('ignores project .env files in the working directory', async () => {
		const project = join(directory, 'project');
		await mkdir(project);
		await writeFile(
			join(project, '.env'),
			'KAINBU_API_BASE=http://127.0.0.1:1\nKAINBU_API_KEY=project_key_long_enough\n'
		);
		const login = await run(
			['login', '--server', base, '--api-key', '-', '--profile', 'saved', '--json'],
			'saved_key_long_enough',
			{ KAINBU_API_KEY: '', KAINBU_API_BASE: '' },
			project
		);
		expect(login.code).toBe(0);
		const me = await run(
			['whoami', '--json'],
			undefined,
			{
				KAINBU_API_KEY: '',
				KAINBU_API_BASE: ''
			},
			project
		);
		expect(me.code).toBe(0);
		expect(me.data.id).toBe('saved-user');
		if (process.platform !== 'win32')
			expect((await stat(join(directory, 'auth.json'))).mode & 0o777).toBe(0o600);
	});
	it('imports only the PocketBase URL from a project .env', async () => {
		const project = join(directory, 'project');
		await mkdir(project);
		await writeFile(
			join(project, '.env'),
			'VITE_POCKETBASE_URL=http://127.0.0.1:8090/\nPOCKETBASE_ADMIN_PASSWORD=secret-value\n'
		);
		const imported = await run(['config', 'import-env', '--json'], undefined, {}, project);
		expect(imported.code).toBe(0);
		const config = await readFile(join(directory, 'config.json'), 'utf8');
		expect(JSON.parse(config).pocketbaseUrl).toBe('http://127.0.0.1:8090');
		expect(config).not.toContain('secret-value');
		await expect(stat(join(directory, '.env'))).rejects.toThrow();
	});
	it('maps invalid login input and missing profiles to documented exit codes', async () => {
		const badUrl = await run(
			['login', '--server', 'not a url', '--api-key', '-', '--json'],
			'saved_key_long_enough',
			{ KAINBU_API_KEY: '' }
		);
		expect(badUrl.code).toBe(2);
		expect(badUrl.error.error.code).toBe('invalid_arguments');
		const missing = await run(['auth', 'profiles', '--use', 'nope', '--json']);
		expect(missing.code).toBe(4);
		expect(missing.error.error.code).toBe('not_found');
	});
	it('switches saved profiles non-interactively and logout clears the active key', async () => {
		const login = await run(
			['login', '--server', base, '--api-key', '-', '--profile', 'saved', '--json'],
			'saved_key_long_enough',
			{ KAINBU_API_KEY: '' }
		);
		expect(login.code).toBe(0);
		const selected = await run(['login', '--profile', 'saved', '--json'], undefined, {
			KAINBU_API_KEY: ''
		});
		expect(selected.data.user.id).toBe('saved-user');
		const logout = await run(['logout', '--json'], undefined, { KAINBU_API_KEY: '' });
		expect(logout.code).toBe(0);
		const who = await run(['whoami', '--json'], undefined, { KAINBU_API_KEY: '' });
		expect(who.code).toBe(3);
		expect(who.error.error.code).toBe('unauthenticated');
	});
	it.each(['auth.json', 'config.json'])(
		'preserves corrupt %s and reports it instead of switching context',
		async (file) => {
			await writeFile(join(directory, file), '{broken');
			const result = await run(['task', 'list', '--board', 'b1', '--json']);
			expect(result.code).toBe(2);
			expect(result.error.error.code).toBe('invalid_config');
			expect(result.stdout).toBe('');
			expect(await readFile(join(directory, file), 'utf8')).toBe('{broken');
		}
	);
	it('resolves references after the old 120-line cutoff and paginates all rows', async () => {
		snapshot.projects[0].boards[0].kanbanData[0].tasks = Array.from({ length: 150 }, (_, i) => ({
			id: 'large-' + i,
			title: 'Task ' + i,
			tags: []
		}));
		const list = await run(['ls', 'b1', '--limit', '50', '--offset', '100', '--json']);
		expect(list.data).toMatchObject({ total: 150, hasMore: false });
		expect(list.data.tasks[49]).toMatchObject({ id: 'large-149', ref: 'T150' });
		const get = await run(['task', 'get', 'T150', '--board', 'b1', '--json']);
		expect(get.data.id).toBe('large-149');
	});
	it.each([
		[401, 3, 'unauthenticated'],
		[403, 3, 'forbidden'],
		[404, 4, 'not_found'],
		[409, 5, 'conflict']
	])('preserves HTTP %i as a machine error', async (status, exitCode, code) => {
		failure = status as number;
		const result = await run(['--json', 'whoami']);
		expect(result.code).toBe(exitCode);
		expect(result.stdout).toBe('');
		expect(result.error.error).toMatchObject({ status, code });
	});
	it('times out instead of hanging, without retrying requests', async () => {
		const result = await run(['--json', 'whoami', '--timeout', '50'], undefined, {
			KAINBU_API_KEY: 'slow'
		});
		expect(result.error.error.code).toBe('timeout');
		expect(result.code).toBe(1);
		expect(requests).toHaveLength(1);
	});
	it('scopes explicit projects strictly and reads pages without a board', async () => {
		const wrong = await run(['task', 'add', 'Oops', '--project', 'p1', '--board', 'b2', '--json']);
		expect(wrong.code).toBe(4);
		expect(requests.every((r) => r.method === 'GET')).toBe(true);
		const empty = await run(['page', 'get', 'pg', '--project', 'empty', '--json']);
		expect(empty.data.content).toBe('hello');
		const exact = await run<{ id: string }[]>(['board', 'list', '--project', 'Work', '--json']);
		expect(exact.data[0].id).toBe('b1');
	});
	it('rejects invalid/ambiguous columns and missing tasks without writes', async () => {
		for (const args of [
			['task', 'add', 'Oops', '--column', 'missing'],
			['column', 'update', 'missing', '--title', 'Oops'],
			['task', 'get', 'gone']
		]) {
			const result = await run([...args, '--board', 'b1', '--json']);
			expect(result.code).toBe(4);
		}
		snapshot.projects[0].boards[0].kanbanData.push({ id: 'duplicate', title: 'Todo', tasks: [] });
		const ambiguous = await run([
			'task',
			'add',
			'Oops',
			'--column',
			'Todo',
			'--board',
			'b1',
			'--json'
		]);
		expect(ambiguous.error.error.code).toBe('ambiguous_target');
		expect(requests.every((r) => r.method === 'GET')).toBe(true);
	});
	it('returns task state and revisions, excludes trash, and keeps ls options working', async () => {
		const result = await run(['--json', 'ls', 'b1', '--checked', 'false', '--limit', '1']);
		expect(result.data).toMatchObject({
			boardId: 'b1',
			total: 1,
			tasks: [{ id: 't1', columnId: 'c1', checked: false }]
		});
		expect(result.data.tasks[0].revision).toHaveLength(64);
	});
	it('previews, detects stale revisions, and sets completion repeatably', async () => {
		const before = await run(['task', 'get', 't1', '--board', 'b1', '--json']);
		const preview = await run([
			'task',
			'update',
			't1',
			'--board',
			'b1',
			'--checked',
			'true',
			'--if-match',
			before.data.revision,
			'--dry-run',
			'--json'
		]);
		expect(preview.data).toMatchObject({ dryRun: true, id: 't1', task: { checked: true } });
		expect(requests.every((r) => r.method === 'GET')).toBe(true);
		const updated = await run([
			'task',
			'update',
			't1',
			'--board',
			'b1',
			'--checked',
			'true',
			'--json'
		]);
		expect(updated.data.task.checked).toBe(true);
		const repeat = await run([
			'task',
			'check',
			't1',
			'--board',
			'b1',
			'--checked',
			'true',
			'--json'
		]);
		expect(repeat.data.unchanged).toBe(true);
		expect(requests.filter((r) => r.method === 'POST')).toHaveLength(1);
		const stale = await run([
			'task',
			'delete',
			't1',
			'--board',
			'b1',
			'--if-match',
			before.data.revision,
			'--json'
		]);
		expect(stale.code).toBe(5);
	});
	const posts = () => requests.filter((r) => r.method === 'POST');
	const lastNext = () => posts().at(-1)!.body.next;
	const board = () => snapshot.projects[0].boards[0].kanbanData;
	const writeConfig = (config: object) =>
		writeFile(join(directory, 'config.json'), JSON.stringify(config));

	it('soft-deletes like the web app and removes links to the deleted task', async () => {
		board()[0].tasks[0].linkedTaskIds = ['t2'];
		board()[0].tasks.splice(1, 0, { id: 't2', title: 'Second', tags: [], linkedTaskIds: ['t1'] });
		const result = await run(['task', 'delete', 't1', '--board', 'b1', '--json']);
		expect(result.code, result.stderr).toBe(0);
		const todo: Task[] = lastNext()[0].tasks;
		expect(todo.find((task) => task.id === 't1')!.deletedAt).toBeGreaterThan(0);
		expect(todo.find((task) => task.id === 't2')!.linkedTaskIds).toEqual([]);
		// Trash stays on the board after the live tasks, like retainDeletedTasks.
		expect(todo.map((task) => task.id)).toEqual(['t2', 't1', 'gone']);
	});

	it('moves completed tasks to Done and gives new tasks the board defaults', async () => {
		snapshot.projects[0].members = [{ userId: 'u-ana', username: 'ana', role: 'member' }];
		board()[1].tasks.push({
			id: 'old',
			title: 'Old',
			tags: [{ id: 'g', label: 'bug', color: 'tone:teal' }]
		});
		const checked = await run(['task', 'check', 't1', '--board', 'b1', '--json']);
		expect(checked.data.columnId).toBe('c2');
		expect(lastNext()[1].tasks[0]).toMatchObject({ id: 't1', checked: true });
		const added = await run([
			'task',
			'add',
			'New',
			'--board',
			'b1',
			'--tag',
			'bug,ui',
			'--assign',
			'@ana',
			'--due',
			'2026-12-01',
			'--color',
			'red',
			'--json'
		]);
		expect(added.code, added.stderr).toBe(0);
		const created = added.data.task;
		expect(created).toMatchObject({ hasCheckbox: true, assignedTo: 'u-ana', color: 'tone:red' });
		expect(created.tags.map((tag) => [tag.label, tag.color])).toEqual([
			['bug', 'tone:teal'],
			['ui', 'tone:red']
		]);
		expect(new Date(created.countdownAt!).getHours()).toBe(17);
		const unknown = await run([
			'task',
			'add',
			'X',
			'--board',
			'b1',
			'--assign',
			'nobody',
			'--json'
		]);
		expect(unknown.code).toBe(4);
	});

	it('updates several tasks in one write and filters by tag', async () => {
		board()[0].tasks.push({ id: 't2', title: 'Second', tags: [] });
		const result = await run<{ ids: string[] }>([
			'task',
			'update',
			't1',
			't2',
			'--add-tag',
			'x',
			'--board',
			'b1',
			'--json'
		]);
		expect(result.data.ids).toEqual(['t1', 't2']);
		expect(posts()).toHaveLength(1);
		const listed = await run(['ls', 'b1', '--tag', 'x', '--json']);
		expect(listed.data.total).toBe(2);
	});

	it('requires an id or exact name for writes but not for reads', async () => {
		snapshot.projects[2].pages.push({ id: 'pg2', name: 'Meeting notes', content: '' });
		const read = await run(['page', 'get', 'Meet', '--project', 'empty', '--json']);
		expect(read.data.id).toBe('pg2');
		const write = await run(['page', 'delete', 'Meet', '--project', 'empty', '--json']);
		expect(write.code).toBe(4);
		expect(write.error.error).toMatchObject({ hint: expect.stringContaining('Meeting notes') });
		expect(posts()).toHaveLength(0);
	});

	it('refuses a stale saved board instead of using the first board', async () => {
		await writeConfig({ activeProjectId: 'p1', activeBoardId: 'missing' });
		const result = await run(['task', 'add', 'Oops', '--json']);
		expect(result.code).toBe(2);
		expect(result.error.error.code).toBe('context_required');
		expect(posts()).toHaveLength(0);
	});

	it('has no scratchpad command; notes are pages', async () => {
		const result = await run(['scratchpad', 'show', '--project', 'p1', '--json']);
		expect(result.code).toBe(2);
		expect(result.error.error).toMatchObject({
			code: 'invalid_arguments',
			message: "unknown command 'scratchpad'"
		});
		expect(requests).toHaveLength(0);
	});

	it('reports an outdated server instead of a missing task', async () => {
		const result = await run(['task', 'comment', 'list', 't1', '--board', 'b1', '--json']);
		expect(result.error.error.code).toBe('unsupported_server');
	});

	it('selects an exactly named board in another project with use', async () => {
		await writeConfig({ activeProjectId: 'p1' });
		const result = await run<{ projectId: string; boardId: string }>(['use', 'Other', '--json']);
		expect(result.data).toMatchObject({ projectId: 'p2', boardId: 'b2' });
	});

	it('finds tasks assigned to me across projects', async () => {
		snapshot.projects[1].members = [{ userId: 'env-user', role: 'owner' }];
		snapshot.projects[1].boards[0].kanbanData = [
			{
				id: 'x1',
				title: 'Inbox',
				tasks: [{ id: 'mine', title: 'Mine', tags: [], assignedTo: 'env-user' }]
			}
		];
		const result = await run<{ tasks: { id: string; projectName: string }[] }>(['mine', '--json']);
		expect(result.data.tasks).toEqual([
			expect.objectContaining({ id: 'mine', projectName: 'Work archive' })
		]);
	});

	it('keeps task revisions stable when only server timestamps change', async () => {
		const before = await run(['task', 'get', 't1', '--board', 'b1', '--json']);
		board()[0].tasks[0].updatedAt = 999;
		const result = await run([
			'task',
			'update',
			't1',
			'--title',
			'Renamed',
			'--if-match',
			before.data.revision,
			'--board',
			'b1',
			'--json'
		]);
		expect(result.code, result.stderr).toBe(0);
		expect(result.data.revision).toHaveLength(64);
	});

	it('guards column deletes that would drop tasks', async () => {
		const refused = await run(['column', 'delete', 'Todo', '--board', 'b1', '--json']);
		expect(refused.code).toBe(2);
		const moved = await run([
			'column',
			'delete',
			'Todo',
			'--move-tasks-to',
			'Done',
			'--board',
			'b1',
			'--json'
		]);
		expect(moved.code, moved.stderr).toBe(0);
		expect(lastNext().map((column) => column.id)).toEqual(['c2']);
		expect(lastNext()[0].tasks.map((task) => task.id)).toEqual(['t1']);
	});

	it('lists every remaining task after --offset and hides placeholder pages', async () => {
		board()[0].tasks = Array.from({ length: 30 }, (_, i) => ({
			id: 'n' + i,
			title: 'N' + i,
			tags: []
		}));
		const list = await run(['ls', 'b1', '--offset', '5', '--json']);
		expect(list.data.tasks).toHaveLength(25);
		snapshot.projects[2].pages = [{ id: '__fallback_page__empty', name: 'Notes', content: '' }];
		const pages = await run<unknown[]>(['page', 'list', '--project', 'empty', '--json']);
		expect(pages.data).toEqual([]);
	});

	it('accepts multiline task descriptions from stdin and returns the created ID', async () => {
		const result = await run(
			['task', 'add', 'New', '--board', 'b1', '--description-file', '-', '--json'],
			'First\n\n第二行\n'
		);
		expect(result.code, result.stderr).toBe(0);
		expect(result.data.id).toBeTruthy();
		expect(result.data.task.description).toBe('First\n\n第二行\n');
		expect(requests.find((r) => r.method === 'POST')?.body.next[0].tasks[0].id).toBe(
			result.data.id
		);
	});
});

describe.runIf(process.env.KAINBU_PB_INTEGRATION === '1')(
	'CLI against disposable PocketBase + API',
	() => {
		it('uses a real PAT for complete task, page, and column workflows', async () => {
			base = process.env.KAINBU_TEST_BASE!;
			const pb = new PocketBase(process.env.KAINBU_TEST_PB);
			const email = `cli-${Date.now()}@kainbu.test`,
				password = 'DisposableAgentTest123!';
			await pb.collection('users').create({ email, password, passwordConfirm: password });
			await pb.collection('users').authWithPassword(email, password);
			const response = await fetch(base + '/api/me/api-keys', {
				method: 'POST',
				headers: {
					Authorization: 'Bearer ' + pb.authStore.token,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ name: 'CLI test' })
			});
			expect(response.status).toBe(200);
			const token = (await response.json()).token;
			const cli = async <T = CliData>(args: string[], input?: string) => {
				const result = await run<T>([...args, '--json', '--non-interactive'], input, {
					KAINBU_API_KEY: token
				});
				expect(result.code, result.stderr).toBe(0);
				expect(result.stderr).toBe('');
				return result.data;
			};
			const project = await cli(['project', 'create', 'Agent workspace', '--no-use']);
			const boards = await cli<{ id: string }[]>(['board', 'list', '--project', project.id]);
			await expect(readFile(join(directory, 'config.json'))).rejects.toMatchObject({
				code: 'ENOENT'
			});
			const newBoard = await cli([
				'board',
				'create',
				'Agent board',
				'--project',
				project.id,
				'--no-use'
			]);
			await expect(readFile(join(directory, 'config.json'))).rejects.toMatchObject({
				code: 'ENOENT'
			});
			await cli([
				'board',
				'rename',
				'Agent board renamed',
				'--project',
				project.id,
				'--board',
				newBoard.id
			]);
			await cli(['board', 'delete', newBoard.id, '--project', project.id]);
			await cli(['project', 'rename', 'Agent workspace renamed', '--project', project.id]);
			const context = ['--project', project.id, '--board', boards[0].id];
			const column = await cli(['column', 'add', 'Agent queue', ...context]);
			const created = await cli(
				['task', 'add', 'Agent task', '--column', column.id, '--description-file', '-', ...context],
				'# Test\n\nMultiline content'
			);
			const task = await cli(['task', 'get', created.id, ...context]);
			expect(task.description).toBe('# Test\n\nMultiline content');
			await cli([
				'task',
				'update',
				created.id,
				'--checked',
				'true',
				'--if-match',
				task.revision,
				...context
			]);
			const done = await cli(['task', 'get', created.id, ...context]);
			expect(done.checked).toBe(true);
			expect(done.completedAt).toBeGreaterThan(0);
			const stale = await run(
				['task', 'delete', created.id, '--if-match', task.revision, ...context, '--json'],
				undefined,
				{ KAINBU_API_KEY: token }
			);
			expect(stale.code).toBe(5);
			await cli(['task', 'delete', created.id, '--if-match', done.revision, ...context]);
			const tasks = await cli(['task', 'list', '--column', column.id, ...context]);
			expect(tasks.total).toBe(0);
			const page = await cli(['page', 'create', 'Agent notes', '--project', project.id]);
			const before = await cli(['page', 'get', page.id, '--project', project.id]);
			await cli(
				[
					'page',
					'set',
					page.id,
					'--file',
					'-',
					'--if-match',
					before.revision,
					'--project',
					project.id
				],
				'Page content\n'
			);
			expect((await cli(['page', 'get', page.id, '--project', project.id])).content).toBe(
				'Page content\n'
			);
			// The HTTP endpoint must reject a stale base inside the server transaction too.
			const conflict = await fetch(base + '/api/workspace/pages/content', {
				method: 'POST',
				headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
				body: JSON.stringify({
					projectId: project.id,
					pageId: page.id,
					content: 'Stale overwrite',
					previousContent: before.content
				})
			});
			expect(conflict.status).toBe(409);
			await cli(['page', 'delete', page.id, '--project', project.id]);
			// 0.2.1: task fields, comments, attachments, trash, settings, moves, pages, search.
			const me = await cli<{ id: string }>(['whoami']);
			const second = await cli([
				'task',
				'add',
				'Agent second',
				'--column',
				column.id,
				'--tag',
				'agent,cli',
				'--assign',
				'me',
				'--due',
				'2026-12-01',
				...context
			]);
			const fields = await cli(['task', 'get', second.id, ...context]);
			expect(fields.assignedTo).toBe(me.id);
			expect(fields.tags.map((tag) => tag.label)).toEqual(['agent', 'cli']);
			expect(fields.countdownAt).toBeGreaterThan(0);
			const comment = await cli<{ id: string }>([
				'task',
				'comment',
				'add',
				second.id,
				'Looks good',
				...context
			]);
			const comments = await cli<{ comments: { id: string; body: string }[] }>([
				'task',
				'comment',
				'list',
				second.id,
				...context
			]);
			expect(comments.comments.map((entry) => entry.body)).toEqual(['Looks good']);
			const upload = join(directory, 'notes.txt');
			await writeFile(upload, 'attachment body');
			const attached = await cli<{ id: string }>([
				'task',
				'attachment',
				'add',
				second.id,
				upload,
				...context
			]);
			const downloaded = join(directory, 'downloaded.txt');
			await cli([
				'task',
				'attachment',
				'download',
				attached.id,
				'--output',
				downloaded,
				'--project',
				project.id
			]);
			expect(await readFile(downloaded, 'utf8')).toBe('attachment body');
			await cli(['task', 'attachment', 'delete', attached.id, '--project', project.id]);
			await cli(['task', 'comment', 'delete', comment.id, '--project', project.id]);
			await cli(['task', 'delete', second.id, ...context]);
			const trash = await cli(['task', 'list', '--deleted', ...context]);
			expect(trash.tasks.map((entry) => entry.id)).toContain(second.id);
			await cli(['task', 'restore', second.id, ...context]);
			const shipped = await cli(['column', 'add', 'Shipped', ...context]);
			await cli(['board', 'settings', '--checked-column', shipped.id, ...context]);
			const completed = await cli(['task', 'check', second.id, ...context]);
			expect(completed.columnId).toBe(shipped.id);
			const otherBoard = await cli([
				'board',
				'create',
				'Agent other',
				'--project',
				project.id,
				'--no-use'
			]);
			const otherContext = ['--project', project.id, '--board', otherBoard.id];
			const inbox = await cli(['column', 'add', 'Inbox', ...otherContext]);
			await cli(['task', 'comment', 'add', second.id, 'Travels along', ...context]);
			await cli([
				'task',
				'move',
				second.id,
				'--to-board',
				otherBoard.id,
				'--column',
				inbox.id,
				...context
			]);
			const moved = await cli(['task', 'get', second.id, ...otherContext]);
			expect(moved.columnId).toBe(inbox.id);
			const kept = await cli<{ comments: unknown[] }>([
				'task',
				'comment',
				'list',
				second.id,
				...otherContext
			]);
			expect(kept.comments).toHaveLength(1);
			await cli(['board', 'move', otherBoard.id, '--position', 'top', '--project', project.id]);
			const ordered = await cli<{ id: string }[]>(['board', 'list', '--project', project.id]);
			expect(ordered[0].id).toBe(otherBoard.id);
			const share = await cli<{ shareUrl: string }>(['board', 'share', ...otherContext]);
			expect(share.shareUrl).toContain('/');
			const draft = await cli([
				'page',
				'create',
				'Agent draft',
				'--text',
				'First line',
				'--project',
				project.id
			]);
			await cli(['page', 'append', draft.id, '--text', 'Second line', '--project', project.id]);
			expect((await cli(['page', 'get', draft.id, '--project', project.id])).content).toBe(
				'First line\nSecond line'
			);
			await cli(['page', 'move', draft.id, '--position', 'top', '--project', project.id]);
			const pages = await cli<{ id: string }[]>(['page', 'list', '--project', project.id]);
			expect(pages[0].id).toBe(draft.id);
			const found = await cli<{ tasks: { id: string }[]; pages: { id: string }[] }>([
				'search',
				'Second',
				'--project',
				project.id
			]);
			expect(found.tasks.map((entry) => entry.id)).toContain(second.id);
			expect(found.pages.map((entry) => entry.id)).toContain(draft.id);
			const refused = await run(
				['column', 'delete', inbox.id, ...otherContext, '--json'],
				undefined,
				{
					KAINBU_API_KEY: token
				}
			);
			expect(refused.code).toBe(2);
			await cli(['column', 'update', column.id, '--title', 'Renamed column', ...context]);
			await cli(['column', 'delete', column.id, ...context]);
		}, 60_000);
	}
);
