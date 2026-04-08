import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const resolveSdkDir = () => {
	const fallbackLocalAppData = path.join(os.homedir(), 'AppData', 'Local');
	const candidates = [
		process.env.ANDROID_HOME,
		process.env.ANDROID_SDK_ROOT,
		process.platform === 'win32'
			? path.join(process.env.LOCALAPPDATA ?? fallbackLocalAppData, 'Android', 'Sdk')
			: undefined,
		process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Android', 'sdk') : undefined,
		process.platform === 'linux' ? path.join(os.homedir(), 'Android', 'Sdk') : undefined
	].filter(Boolean);

	return candidates.find((candidate) => existsSync(candidate));
};

export const ensureAndroidSdk = (projectRoot = process.cwd()) => {
	const androidDir = path.join(projectRoot, 'android');
	const localPropertiesPath = path.join(androidDir, 'local.properties');

	if (!existsSync(androidDir)) {
		throw new Error(`Android project directory was not found at ${androidDir}. Run "npx cap sync android" first.`);
	}

	const existing = existsSync(localPropertiesPath) ? readFileSync(localPropertiesPath, 'utf8') : '';
	const existingSdkDir = existing.match(/^sdk\.dir=(.+)$/m)?.[1];

	if (existingSdkDir) {
		console.log(`Using Android SDK from existing local.properties: ${existingSdkDir}`);
		return localPropertiesPath;
	}

	const sdkDir = resolveSdkDir();

	if (!sdkDir) {
		throw new Error(
			'Android SDK location not found. Set ANDROID_HOME or ANDROID_SDK_ROOT, then rerun the build.'
		);
	}

	const sdkLine = `sdk.dir=${path.resolve(sdkDir).replace(/\\/g, '/')}`;
	const nextContent = existing.trim().length > 0 ? `${existing.trimEnd()}\n${sdkLine}\n` : `${sdkLine}\n`;

	writeFileSync(localPropertiesPath, nextContent);
	console.log(`Wrote Android SDK config to ${localPropertiesPath}`);
	return localPropertiesPath;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	try {
		ensureAndroidSdk();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
