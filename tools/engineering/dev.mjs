import { spawn } from 'node:child_process';
const all = process.argv.includes('--all');
const args = ['exec', 'turbo', 'run', 'dev', '--filter=./apps/*'];
if (all) args.push('--filter=./services/*');
const child = spawn('pnpm', args, { stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (status) => process.exit(status ?? 0));
