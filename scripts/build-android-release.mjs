import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';

const projectRoot = process.cwd();
const androidDir = path.join(projectRoot, 'android');
const gradleCommand = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
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
	await runStep(
		'Assemble signed Android release APK',
		gradleCommand,
		['assembleRelease', '-x', 'lintVitalAnalyzeRelease'],
		androidDir
	);

	if (!existsSync(releaseApkPath)) {
		throw new Error(`Release APK was not found at ${releaseApkPath}.`);
	}

	console.log(`\nRelease APK ready at:\n${releaseApkPath}`);
} catch (error) {
	console.error(`\nAndroid release build failed: ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
}
