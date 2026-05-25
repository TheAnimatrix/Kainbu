import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(serverDir, '..');

const preserveDockerEnv = () => {
	const snapshot = {
		KAINBU_ADMIN_EMAILS: process.env.KAINBU_ADMIN_EMAILS,
		KAINBU_PUBLIC_URL: process.env.KAINBU_PUBLIC_URL,
		OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
		POCKETBASE_URL: process.env.POCKETBASE_URL
	};
	return () => {
		for (const [key, value] of Object.entries(snapshot)) {
			if (value !== undefined && value !== '') {
				process.env[key] = value;
			}
		}
	};
};

const restoreDockerEnv = preserveDockerEnv();

const envPaths = [...new Set([
	path.resolve(process.cwd(), '.env'),
	path.resolve(process.cwd(), '.env.local'),
	path.resolve(projectRoot, '.env'),
	path.resolve(projectRoot, '.env.local'),
	path.resolve(serverDir, '.env'),
	path.resolve(serverDir, '.env.local')
])];

export const loadedEnvFiles = envPaths.filter((envPath) => existsSync(envPath));

// Preserve platform/Docker-provided env; only fill in missing keys from files.
for (const envPath of loadedEnvFiles) {
	loadEnv({ path: envPath, override: false, quiet: true });
}
restoreDockerEnv();

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
