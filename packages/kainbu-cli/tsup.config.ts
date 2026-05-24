import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'tsup';

const packageDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(packageDir, '../..');
const libDir = resolve(repoRoot, 'src/lib');

export default defineConfig({
	entry: ['src/index.ts'],
	format: ['esm'],
	platform: 'node',
	target: 'node22',
	outDir: 'dist',
	clean: true,
	shims: true,
	splitting: false,
	sourcemap: true,
	banner: {
		js: '#!/usr/bin/env node'
	},
	esbuildOptions(options) {
		options.alias = {
			$lib: libDir,
			'@kainbu/core': resolve(packageDir, '../kainbu-core/src/index.ts')
		};
	},
	noExternal: [/@kainbu\/core/, /^\$lib/]
});
