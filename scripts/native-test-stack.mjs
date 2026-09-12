import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';

/** Optional native stack for HTTP/browser checks when a Docker engine is unavailable. */
export const startNativeTestStack = async (root, env) => {
	const reservation = createServer();
	await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
	const port = reservation.address().port;
	await new Promise((resolve) => reservation.close(resolve));
	const apiUrl = `http://127.0.0.1:${port}`;
	const api = spawn(
		process.execPath,
		[path.join(root, 'node_modules/tsx/dist/cli.mjs'), 'server/index.ts'],
		{
			cwd: root,
			windowsHide: true,
			stdio: ['ignore', 'pipe', 'pipe'],
			env: { ...env, HOST: '127.0.0.1', PORT: String(port) }
		}
	);
	let logs = '';
	api.stdout.on('data', (chunk) => {
		logs += chunk;
	});
	api.stderr.on('data', (chunk) => {
		logs += chunk;
	});
	let web;
	const close = async () => {
		await web?.close();
		if (api.exitCode === null) {
			const exited = new Promise((resolve) => api.once('exit', resolve));
			api.kill();
			await exited;
		}
	};
	try {
		let healthy = false;
		for (let i = 0; i < 100; i++) {
			try {
				if ((await fetch(`${apiUrl}/health`)).ok) {
					healthy = true;
					break;
				}
			} catch {
				/* starting */
			}
			if (api.exitCode !== null) break;
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
		if (!healthy) throw new Error(`Native API failed to start: ${logs.slice(-3000)}`);
		Object.assign(process.env, {
			VITE_POCKETBASE_URL: '',
			VITE_API_BASE_URL: '',
			VITE_API_PROXY_TARGET: apiUrl
		});
		const { createServer: createViteServer } = await import('vite');
		web = await createViteServer({
			root,
			server: {
				host: '127.0.0.1',
				port: 0,
				proxy: {
					'/pb': { target: env.POCKETBASE_URL, changeOrigin: true, rewrite: (url) => url.slice(3) },
					'/api': { target: apiUrl, changeOrigin: true },
					'/health': { target: apiUrl, changeOrigin: true }
				}
			}
		});
		await web.listen();
		const webUrl = `http://127.0.0.1:${web.httpServer.address().port}`;
		console.log(`Native test stack: ${webUrl} (API ${apiUrl})`);
		return { apiUrl, webUrl, close };
	} catch (error) {
		await close();
		throw error;
	}
};
