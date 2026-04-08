import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';
import { ensureAndroidSdk } from './ensure-android-sdk.mjs';
import { runGradle } from './run-gradle.mjs';

const projectRoot = process.cwd();
const androidDir = path.join(projectRoot, 'android');
const releaseApkPath = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');

const runStep = (label, command, args, cwd = projectRoot) =>
	new Promise((resolve, reject) => {
		console.log(`\n==> ${label}`);
		console.log(`$ ${command} ${args.join(' ')}`);

		const child = spawn(command, args, {
			cwd,
			stdio: 'inherit',
			shell: process.platform === 'win32'
		});

		child.on('exit', (code) => {
			if (code === 0) {
				resolve();
				return;
			}

			reject(new Error(`${label} failed with exit code ${code ?? 'unknown'}.`));
		});

		child.on('error', (error) => {
			reject(error);
		});
	});

try {
	await runStep('Build web app', 'npm', ['run', 'build']);
	await runStep('Sync Capacitor Android project', 'npx', ['cap', 'sync', 'android']);
	ensureAndroidSdk(projectRoot);
	console.log('\n==> Assemble signed Android release APK');
	await runGradle(['assembleRelease', '-x', 'lintVitalAnalyzeRelease'], projectRoot);

	if (!existsSync(releaseApkPath)) {
		throw new Error(`Release APK was not found at ${releaseApkPath}.`);
	}

	console.log(`\nRelease APK ready at:\n${releaseApkPath}`);
} catch (error) {
	console.error(`\nAndroid release build failed: ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
}
