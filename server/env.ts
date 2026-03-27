import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';

const serverDir = __dirname;
const projectRoot = path.resolve(serverDir, '..');

const envPaths = [...new Set([
	path.resolve(process.cwd(), '.env'),
	path.resolve(process.cwd(), '.env.local'),
	path.resolve(projectRoot, '.env'),
	path.resolve(projectRoot, '.env.local'),
	path.resolve(serverDir, '.env'),
	path.resolve(serverDir, '.env.local')
])];

const loadedEnvFiles = envPaths.filter((envPath) => existsSync(envPath));

for (const envPath of loadedEnvFiles) {
	loadEnv({ path: envPath, override: true, quiet: true });
}

const normalizeEnvValue = (value: string | undefined, fallback = '') =>
	(value || fallback)
		.trim()
		.replace(/^['"]|['"]$/g, '')
		.replace(/;+\s*$/, '');

export const getEnv = (name: string, fallback = '') => normalizeEnvValue(process.env[name], fallback);

export const getRequiredEnv = (name: string) => {
	const value = getEnv(name);
	if (!value) {
		const loadedFiles =
			loadedEnvFiles.length > 0
				? loadedEnvFiles
						.map((envPath) => path.relative(projectRoot, envPath) || path.basename(envPath))
						.join(', ')
				: 'none';
		throw new Error(
			`${name} is not configured. Loaded env files: ${loadedFiles}. Current working directory: ${process.cwd()}`
		);
	}

	return value;
};
