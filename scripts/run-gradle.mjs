import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const createGradleTempDir = (projectRoot) => {
	const tempDir = path.join(projectRoot, '.tmp', 'gradle-temp');
	mkdirSync(tempDir, { recursive: true });
	return tempDir;
};

export const runGradle = (args, projectRoot = process.cwd()) => {
	const androidDir = path.join(projectRoot, 'android');
	const gradleCommand = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
	const tempDir = createGradleTempDir(projectRoot);

	console.log(`Using Gradle temp dir: ${tempDir}`);

	return new Promise((resolve, reject) => {
		const child = spawn(gradleCommand, args, {
			cwd: androidDir,
			stdio: 'inherit',
			shell: process.platform === 'win32',
			env: {
				...process.env,
				TEMP: tempDir,
				TMP: tempDir,
				TMPDIR: tempDir
			}
		});

		child.on('exit', (code) => {
			if (code === 0) {
				resolve();
				return;
			}

			reject(new Error(`Gradle failed with exit code ${code ?? 'unknown'}.`));
		});

		child.on('error', (error) => {
			reject(error);
		});
	});
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	runGradle(process.argv.slice(2)).catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	});
}
