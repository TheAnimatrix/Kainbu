import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
	unchanged: boolean;
	total: number;
	content: string;
	pad: { content: string };
};
type Snapshot = {
	projects: {
		id: string;
		name: string;
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

const run = <T = CliData>(args: string[], input?: string, env: NodeJS.ProcessEnv = {}) =>
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
				cwd: directory,
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
			if (req.url === '/api/workspace/snapshot') {
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
		[['--json', 'task', 'update', 't1', '--checked', 'maybe'], 'invalid_arguments']
	])('fails invalid or interactive command %j with clean JSON', async (args, code) => {
		const result = await run(args);
		expect(result.stdout).toBe('');
		expect(result.code).toBe(2);
		expect(result.error.error.code).toBe(code);
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
		it('uses a real PAT for complete task, page, column, and scratchpad workflows', async () => {
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
			const pad = await cli(['scratchpad', 'show', '--project', project.id]);
			await cli(
				[
					'scratchpad',
					'set',
					'--project',
					project.id,
					'--if-revision',
					String(pad.revision),
					'--file',
					'-'
				],
				'Pad content'
			);
			expect((await cli(['scratchpad', 'show', '--project', project.id])).pad.content).toBe(
				'Pad content'
			);
			await cli(['page', 'delete', page.id, '--project', project.id]);
			const newPad = await cli([
				'scratchpad',
				'pad',
				'create',
				'Agent pad',
				'--project',
				project.id
			]);
			await cli(['scratchpad', 'pad', 'rename', newPad.id, 'Renamed pad', '--project', project.id]);
			await cli(['scratchpad', 'pad', 'delete', newPad.id, '--project', project.id]);
			await cli(['column', 'update', column.id, '--title', 'Renamed column', ...context]);
			await cli(['column', 'delete', column.id, ...context]);
		}, 60_000);
	}
);
