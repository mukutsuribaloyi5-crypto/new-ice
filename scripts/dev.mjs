import { spawn } from 'node:child_process';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = ['dev:server', 'dev:client'].map(command => spawn(npm, ['run', command], { stdio: 'inherit', env: process.env, shell: process.platform === 'win32' }));
const stop = () => { for (const child of children) if (!child.killed) child.kill('SIGTERM'); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children) child.on('exit', code => { if (code && code !== 0) { stop(); process.exitCode = code; } });
