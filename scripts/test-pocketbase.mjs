import { startNativeTestStack } from './native-test-stack.mjs';
/** Runs real database regression tests in a disposable, loopback-only instance. */
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, mkdir, cp, readdir, writeFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import PocketBase from 'pocketbase';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = '0.38.2';
const platform = { win32: 'windows', linux: 'linux', darwin: 'darwin' }[process.platform];
const arch = { x64: 'amd64', arm64: 'arm64' }[process.arch];
if (!platform || !arch)
	throw new Error('Unsupported PocketBase test platform. Set KAINBU_TEST_PB_BIN.');
const cache = path.join(tmpdir(), `kainbu-pb-${version}-${platform}-${arch}`);
let binary =
	process.env.KAINBU_TEST_PB_BIN ||
	path.join(cache, process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase');
try {
	await access(binary);
} catch {
	if (process.env.KAINBU_TEST_PB_BIN) throw new Error(`Missing test binary: ${binary}`);
	await mkdir(cache, { recursive: true });
	const response = await fetch(
		`https://github.com/pocketbase/pocketbase/releases/download/v${version}/pocketbase_${version}_${platform}_${arch}.zip`
	);
	if (!response.ok) throw new Error(`PocketBase download failed: ${response.status}`);
	const zip = path.join(cache, 'pocketbase.zip');
	await writeFile(zip, Buffer.from(await response.arrayBuffer()));
	const result =
		process.platform === 'win32'
			? spawnSync(
					'powershell.exe',
					[
						'-NoProfile',
						'-NonInteractive',
						'-Command',
						'Expand-Archive -LiteralPath $env:KAINBU_PB_ZIP -DestinationPath $env:KAINBU_PB_CACHE -Force'
					],
					{ env: { ...process.env, KAINBU_PB_ZIP: zip, KAINBU_PB_CACHE: cache }, windowsHide: true }
				)
			: spawnSync('unzip', ['-o', zip, '-d', cache]);
	if (result.status !== 0) throw new Error('Cannot extract PocketBase test binary.');
}

const args = process.argv.slice(2);
const upgrade = args.includes('--upgrade');
const stack = args.includes('--stack');
const serve = args.includes('--serve');
const tests = args.filter((arg) => !['--upgrade', '--stack', '--serve'].includes(arg));
const directory = await mkdtemp(path.join(tmpdir(), 'kainbu-test-'));
const migrations = path.join(directory, 'migrations');
const hooks = path.join(directory, 'hooks');
await mkdir(migrations);
await cp(path.join(root, 'pocketbase/pb_hooks'), hooks, { recursive: true });
const migrationFiles = await readdir(path.join(root, 'pocketbase/pb_migrations'));
for (const name of migrationFiles) {
	if (!upgrade || name < '1730000038')
		await cp(path.join(root, 'pocketbase/pb_migrations', name), path.join(migrations, name));
}
const portServer = createServer();
await new Promise((resolve) => portServer.listen(0, '127.0.0.1', resolve));
const port = portServer.address().port;
await new Promise((resolve) => portServer.close(resolve));
const base = `http://127.0.0.1:${port}`;
const email = 'integration-admin@kainbu.test';
const password = randomBytes(24).toString('hex');
const common = [
	`--dir=${path.join(directory, 'data')}`,
	`--migrationsDir=${migrations}`,
	`--hooksDir=${hooks}`,
	'--automigrate=false'
];
const setup = spawnSync(binary, ['superuser', 'upsert', email, password, ...common], {
	windowsHide: true,
	encoding: 'utf8'
});
if (setup.status !== 0) throw new Error(`PocketBase initialization failed: ${setup.stderr}`);
let pbProcess;
let logs = '';
const start = async () => {
	pbProcess = spawn(binary, ['serve', `--http=127.0.0.1:${port}`, ...common], {
		windowsHide: true,
		stdio: ['ignore', 'pipe', 'pipe']
	});
	pbProcess.stdout.on('data', (chunk) => {
		logs += chunk;
	});
	pbProcess.stderr.on('data', (chunk) => {
		logs += chunk;
	});
	for (let attempt = 0; attempt < 150; attempt++) {
		if (pbProcess.exitCode !== null)
			throw new Error(`PocketBase exited during startup:\n${logs.slice(-5000)}`);
		try {
			if ((await fetch(`${base}/api/health`)).ok) return;
		} catch {
			/* waiting for the bound port */
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error(`PocketBase startup timed out.\n${logs.slice(-5000)}`);
};
const stop = async () => {
	if (pbProcess && pbProcess.exitCode === null) {
		const exited = new Promise((resolve) => pbProcess.once('exit', resolve));
		pbProcess.kill();
		await exited;
	}
};
let exitCode = 1;
let nativeStack;
try {
	await start();
	if (upgrade) {
		const pb = new PocketBase(base);
		await pb.collection('_superusers').authWithPassword(email, password);
		const user = await pb
			.collection('users')
			.create({ email: 'upgrade-owner@kainbu.test', password, passwordConfirm: password });
		const project = await pb
			.collection('projects')
			.create({ client_id: 'upgrade-project', owner: user.id, name: 'Preserved project' });
		const board = await pb
			.collection('project_boards')
			.create({ project: project.id, client_id: 'upgrade-board', name: 'Preserved board' });
		await pb.collection('project_columns').create({
			project: project.id,
			board: board.id,
			client_id: 'upgrade-column',
			title: 'Preserved column'
		});
		await pb.collection('project_tasks').create({
			project: project.id,
			board: board.id,
			client_id: 'upgrade-task',
			column_id: 'upgrade-column',
			title: 'Preserved task'
		});
		await stop();
		for (const name of migrationFiles)
			await cp(path.join(root, 'pocketbase/pb_migrations', name), path.join(migrations, name));
		await start();
	}
	console.log(`PocketBase ${version}: ${upgrade ? 'upgraded' : 'fresh'} database at ${base}`);
	const env = {
		...process.env,
		POCKETBASE_URL: base,
		POCKETBASE_ADMIN_EMAIL: email,
		POCKETBASE_ADMIN_PASSWORD: password,
		KAINBU_TEST_PB: base,
		KAINBU_TEST_SUPERUSER_EMAIL: email,
		KAINBU_TEST_SUPERUSER_PASSWORD: password,
		KAINBU_PB_INTEGRATION: '1',
		KAINBU_TEST_UPGRADE: upgrade ? '1' : '',
		KAINBU_ADMIN_EMAILS: 'allowlisted@kainbu.test,admin-e2e@kainbu.test',
		KAINBU_PUBLIC_URL: 'http://localhost:3000',
		OPENROUTER_API_KEY: '',
		AI_GATEWAY_API_KEY: '',
		VITE_POCKETBASE_URL: ''
	};
	if (stack || serve) {
		nativeStack = await startNativeTestStack(root, env);
		env.KAINBU_TEST_BASE = nativeStack.apiUrl;
		env.KAINBU_TEST_WEB = nativeStack.webUrl;
	}
	if (serve) {
		const pb = new PocketBase(base);
		await pb.collection('_superusers').authWithPassword(email, password);
		await pb.collection('users').create({
			email: 'browser@kainbu.test',
			password: 'BrowserTestPassword123!',
			passwordConfirm: 'BrowserTestPassword123!',
			username: 'browsertest',
			verified: true
		});
		console.log('Disposable browser account: browser@kainbu.test / BrowserTestPassword123!');
		await new Promise((resolve) => {
			process.once('SIGINT', resolve);
			process.once('SIGTERM', resolve);
		});
		exitCode = 0;
	} else {
		const selected = tests.length
			? tests
			: stack
				? [
						'tests/local-docker.test.ts',
						'tests/deploy.test.ts',
						'tests/backupRestore.integration.test.ts',
						'tests/admin-docker.test.ts',
						'tests/security-p0-docker.test.ts'
					]
				: ['tests/pocketbase.integration.test.ts'];
		const test = spawn(
			process.execPath,
			[
				path.join(root, 'node_modules/vitest/vitest.mjs'),
				'run',
				...selected,
				'--reporter=dot',
				'--fileParallelism=false'
			],
			{ cwd: root, windowsHide: true, stdio: 'inherit', env }
		);
		exitCode = await new Promise((resolve) => test.once('exit', (code) => resolve(code ?? 1)));
	}
} finally {
	await nativeStack?.close();
	await stop();
	await writeFile(path.join(directory, 'pocketbase.log'), logs);
	if (
		exitCode === 0 &&
		path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep + 'kainbu-test-')
	)
		await rm(directory, { recursive: true, force: true });
	else console.log(`Test database and logs retained at ${directory}`);
}
process.exitCode = exitCode;
