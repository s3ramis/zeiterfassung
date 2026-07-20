import { spawn } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [
  spawn(npmCommand, ['run', 'dev:server'], { stdio: 'inherit' }),
  spawn(npmCommand, ['run', 'dev:web'], { stdio: 'inherit' }),
];

function stop(signal = 'SIGTERM') {
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

process.on('SIGINT', () => { stop('SIGINT'); process.exit(0); });
process.on('SIGTERM', () => { stop('SIGTERM'); process.exit(0); });

for (const child of children) {
  child.on('exit', (code) => {
    if (code && code !== 0) {
      stop();
      process.exitCode = code;
    }
  });
}
