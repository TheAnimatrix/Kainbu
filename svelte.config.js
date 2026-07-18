import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		typescript: {
			config(config) {
				config.include.push('../global.d.ts');
			}
		},
		adapter: adapter({
			fallback: 'index.html'
		}),
		prerender: {
			// Workspace IDs are user data and cannot be crawled at build time.
			// The static fallback serves these client-rendered native routes.
			handleUnseenRoutes: 'ignore'
		}
	}
};

export default config;
