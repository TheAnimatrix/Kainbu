import { execFileSync } from 'node:child_process';

const port = Number(process.argv[2] || process.env.PORT || '8788');

if (!Number.isInteger(port) || port <= 0) {
	console.error(`Invalid port: ${process.argv[2] || process.env.PORT || ''}`);
	process.exit(1);
}

const getWindowsPids = () => {
	const output = execFileSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' });

	return [...new Set(
		output
			.split(/\r?\n/)
			.flatMap((line) => {
				const trimmed = line.trim();
				if (!trimmed.startsWith('TCP')) return [];

				const parts = trimmed.split(/\s+/);
				if (parts.length < 5) return [];

				const localAddress = parts[1] || '';
				const state = parts[3];
				const pid = parts[4];
				const localPort = Number(localAddress.slice(localAddress.lastIndexOf(':') + 1));

				if (state !== 'LISTENING' || !Number.isInteger(localPort) || localPort !== port) {
					return [];
				}

				return [pid];
			})
			.filter(Boolean)
	)];
};

const getUnixPids = () => {
	try {
		const output = execFileSync('lsof', ['-ti', `tcp:${port}`], { encoding: 'utf8' }).trim();
		return output ? [...new Set(output.split(/\r?\n/).filter(Boolean))] : [];
	} catch {
		return [];
	}
};

const pids = process.platform === 'win32' ? getWindowsPids() : getUnixPids();

if (!pids.length) {
	console.log(`Port ${port} is already free.`);
	process.exit(0);
}

const killPid = (pid) => {
	if (Number(pid) === process.pid) return;

	if (process.platform === 'win32') {
		execFileSync('taskkill', ['/PID', String(pid), '/F', '/T'], { stdio: 'ignore' });
		return;
	}

	execFileSync('kill', ['-9', String(pid)], { stdio: 'ignore' });
};

for (const pid of pids) {
	killPid(pid);
}

console.log(`Released port ${port} by stopping pid(s): ${pids.join(', ')}`);
