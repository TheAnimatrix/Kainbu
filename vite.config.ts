import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8788';
	const lanHost = env.VITE_LAN_HOST?.trim();

	return {
		plugins: [tailwindcss(), sveltekit()],
		server: {
			host: '127.0.0.1',
			port: 3001,
			strictPort: true,
			allowedHosts: true,
			cors: true,
			hmr: lanHost
				? {
						host: lanHost,
						clientPort: 3001,
						protocol: 'ws'
					}
				: undefined,
			proxy: {
				'/api': {
					target: apiProxyTarget,
					changeOrigin: true
				},
				'/health': {
					target: apiProxyTarget,
					changeOrigin: true
				}
			}
		}
	};
});
