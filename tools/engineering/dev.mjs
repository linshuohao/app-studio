import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const all = process.argv.includes('--all');
const agentOnly = process.argv.includes('--agent');
const children = [];
let stopping = false;

function stop(signal, exitCode) {
  if (stopping) return;
  stopping = true;
  process.exitCode = exitCode;
  for (const child of children) {
    if (!child.pid) continue;
    try {
      if (process.platform === 'win32') child.kill(signal);
      else process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
}

function start(command, args, cwd) {
  const child = spawn(command, args, {
    cwd,
    detached: process.platform !== 'win32',
    stdio: 'inherit',
  });
  children.push(child);
  child.once('error', (error) => {
    console.error(`Could not start ${command}: ${error.message}`);
    stop('SIGTERM', 1);
  });
  child.once('exit', (code) => stop('SIGTERM', code ?? 1));
}

process.once('SIGINT', () => stop('SIGINT', 130));
process.once('SIGTERM', () => stop('SIGTERM', 143));

if (!agentOnly) {
  const args = ['exec', 'turbo', 'run', 'dev', '--filter=./apps/*'];
  if (all) args.push('--filter=./services/*');
  start('pnpm', args);
}

if (all || agentOnly) {
  start(
    'uv',
    [
      'run',
      '--locked',
      'uvicorn',
      'form_agent.dev:create_dev_app',
      '--factory',
      '--host',
      '127.0.0.1',
      '--port',
      process.env.AGENT_PORT ?? '8100',
      '--reload',
      '--reload-dir',
      'src',
    ],
    fileURLToPath(new URL('../../services/agent/', import.meta.url)),
  );
}
