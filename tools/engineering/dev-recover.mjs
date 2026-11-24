import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const apiDir = resolve(root, 'services/api');
const mode = process.argv.includes('--check')
  ? 'check'
  : process.argv.includes('--restart')
    ? 'restart'
    : 'repair';
const help = process.argv.includes('--help') || process.argv.includes('-h');
const timeoutMs = 120_000;

function envFile(path) {
  try {
    return Object.fromEntries(
      readFileSync(path, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && line.includes('='))
        .map((line) => {
          const separator = line.indexOf('=');
          const key = line.slice(0, separator).trim();
          let value = line.slice(separator + 1).trim();
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }
          return [key, value];
        }),
    );
  } catch {
    return {};
  }
}

function setting(name, fileValues = {}) {
  return process.env[name] ?? fileValues[name];
}

const apiEnv = envFile(resolve(apiDir, '.env.local'));
const studioEnv = envFile(resolve(root, 'apps/studio/.env.local'));
const databaseUrl = setting('PLATFORM_DATABASE_URL', apiEnv);
const apiPort = Number(setting('API_PORT', apiEnv) ?? 3001);
const studioPort = 3200;
const playgroundPort = Number(process.env.PORT ?? 3000);
const agentPort = Number(process.env.AGENT_PORT ?? 8100);
const studioApiUrl = setting('PLATFORM_API_URL', studioEnv) ?? 'http://127.0.0.1:3001';
const services = [
  // This route reads the current session from PostgreSQL; 401 is a healthy unauthenticated response.
  { name: 'API', url: `http://127.0.0.1:${apiPort}/api/platform/account` },
  { name: 'Studio', url: `http://127.0.0.1:${studioPort}/` },
  { name: 'Playground', url: `http://127.0.0.1:${playgroundPort}/` },
  { name: 'Agent', url: `http://127.0.0.1:${agentPort}/health` },
];

function platformDatabaseName() {
  try {
    return decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\/+/, '')) || 'postgres';
  } catch {
    return 'postgres';
  }
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: 'utf8',
    timeout: options.timeout ?? 15_000,
    env: process.env,
  });
}

function safeError(result) {
  const message = (result.error?.message ?? result.stderr ?? result.stdout ?? 'unknown error')
    .trim()
    .replace(/postgres(?:ql)?:\/\/[^\s'"`]+/gi, '<database-url-redacted>')
    .replace(/(POSTGRES_PASSWORD\s*[=:]\s*)\S+/gi, '$1<redacted>');
  return message.split('\n').slice(0, 3).join('\n');
}

function compose(args) {
  return run(
    'docker',
    ['compose', '--env-file', '.env.postgres.local', '-f', 'compose.postgres.yaml', ...args],
    { cwd: apiDir },
  );
}

function postgresReady() {
  const result = compose([
    'exec',
    '-T',
    'postgres',
    'pg_isready',
    '-U',
    'postgres',
    '-d',
    platformDatabaseName(),
  ]);
  return result.status === 0;
}

async function probe(url, checkAgentReadiness = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'manual' });
    if (!checkAgentReadiness) return { status: response.status };
    if (!response.ok) return { status: response.status, ready: false };
    const health = await response.json();
    return {
      status: response.status,
      ready: health.running === true && health.create_form_ready === true,
    };
  } catch {
    return checkAgentReadiness ? { status: null, ready: false } : { status: null };
  } finally {
    clearTimeout(timer);
  }
}

async function inspect() {
  const db = postgresReady();
  const results = await Promise.all(
    services.map(async (service) => ({
      ...service,
      ...(await probe(service.url, service.name === 'Agent')),
    })),
  );
  return { db, services: results };
}

function servicesHealthy(report) {
  return report.services.every(
    (service) =>
      service.status >= 200 && service.status < 500 && (service.name !== 'Agent' || service.ready),
  );
}

function printReport(report, heading = '检查结果') {
  console.log(`\n${heading}`);
  console.log(`PostgreSQL: ${report.db ? '可连接' : '未就绪'}`);
  for (const service of report.services) {
    const readiness =
      service.name === 'Agent' && service.status
        ? `，CreateForm ${service.ready ? '可用' : '未就绪'}`
        : '';
    console.log(
      `${service.name}: ${service.status ? `HTTP ${service.status}` : '无响应'}${readiness} (${service.url})`,
    );
  }
  try {
    const configuredApiPort =
      new URL(studioApiUrl).port || (studioApiUrl.startsWith('https:') ? '443' : '80');
    if (Number(configuredApiPort) !== apiPort) {
      console.log(`配置不一致: Studio 代理 API 端口 ${configuredApiPort}，API 监听端口 ${apiPort}`);
    }
  } catch {
    console.log('配置错误: Studio 的 PLATFORM_API_URL 不是有效 URL');
  }
}

function listenerPids(port) {
  const result = run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']);
  if (result.status !== 0 && result.status !== 1) throw new Error(safeError(result));
  return [...new Set((result.stdout ?? '').split(/\s+/).filter(Boolean).map(Number))];
}

function processCwd(pid) {
  const result = run('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']);
  return (result.stdout ?? '')
    .split('\n')
    .find((line) => line.startsWith('n'))
    ?.slice(1);
}

function isInsideProject(path) {
  if (!path || !isAbsolute(path)) return false;
  const rel = relative(root, path);
  return (
    rel === '' ||
    (!rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && rel !== '..')
  );
}

async function stopProjectListeners() {
  const occupied = new Map();
  for (const service of services) {
    const port = new URL(service.url).port;
    for (const pid of listenerPids(port)) {
      occupied.set(pid, { service: service.name, port, cwd: processCwd(pid) });
    }
  }
  const unknown = [...occupied.entries()].filter(([, item]) => !isInsideProject(item.cwd));
  if (unknown.length) {
    console.error('\n未重启：以下监听端口不属于当前项目，避免误停其他进程：');
    for (const [pid, item] of unknown) {
      console.error(`- ${item.service} :${item.port}, PID ${pid}, cwd=${item.cwd ?? '无法确认'}`);
    }
    process.exitCode = 2;
    return false;
  }
  if (!occupied.size) return true;

  for (const [pid, item] of occupied) {
    console.log(`向项目进程发送 SIGTERM: ${item.service} :${item.port} (PID ${pid})`);
    try {
      process.kill(pid, 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const remaining = services.flatMap((service) => listenerPids(new URL(service.url).port));
    if (remaining.length === 0) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  console.error('未能在 10 秒内释放项目服务端口；为避免强制终止，停止修复。');
  process.exitCode = 2;
  return false;
}

async function ensurePostgres() {
  if (postgresReady()) return true;
  console.log('\n启动项目 PostgreSQL（保留现有数据卷）…');
  const result = compose(['up', '-d', '--wait']);
  if (result.status !== 0) {
    console.error(`PostgreSQL 启动失败：${safeError(result)}`);
    process.exitCode = 1;
    return false;
  }
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (postgresReady()) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  console.error('PostgreSQL 容器已启动，但 pg_isready 未通过。');
  process.exitCode = 1;
  return false;
}

async function waitForServices(child) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode !== null)
      throw new Error(`开发服务启动器提前退出，状态码 ${child.exitCode}`);
    const report = await inspect();
    if (report.db && servicesHealthy(report)) {
      printReport(report, '恢复完成');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error('等待服务健康检查超时（120 秒）');
}

function usage() {
  console.log(
    `用法：pnpm dev:recover [--check | --repair | --restart]\n\n默认尝试修复；--check 只检查；--repair 与默认行为相同；--restart 无论健康状态都重启。\n只会停止工作目录位于当前仓库内的监听进程；不迁移数据库、不删除数据卷。`,
  );
}

if (help) {
  usage();
  process.exit(0);
}

if (
  ![apiPort, playgroundPort, agentPort].every(
    (port) => Number.isInteger(port) && port > 0 && port < 65536,
  )
) {
  console.error('端口配置无效；请检查 API_PORT、PORT 与 AGENT_PORT。');
  process.exit(2);
}

let report = await inspect();
printReport(report);
const healthy = report.db && servicesHealthy(report);
if (mode === 'check') {
  process.exitCode = healthy ? 0 : 1;
} else if (mode === 'repair' && healthy) {
  console.log('\n所有服务已健康，无需重启。');
} else {
  if (!(await ensurePostgres())) process.exit(process.exitCode ?? 1);
  if (!(await stopProjectListeners())) process.exit(process.exitCode ?? 2);

  console.log('\n启动完整本地开发服务：pnpm dev:all');
  const child = spawn('pnpm', ['dev:all'], { cwd: root, stdio: 'inherit' });
  const exit = new Promise((resolve) => child.once('exit', (code) => resolve(code ?? 1)));
  let stopping = false;
  const forwardSignal = (signal) => {
    if (stopping) return;
    stopping = true;
    child.kill(signal);
  };
  process.once('SIGINT', () => forwardSignal('SIGINT'));
  process.once('SIGTERM', () => forwardSignal('SIGTERM'));
  child.once('error', (error) => {
    console.error(`无法启动 pnpm dev:all：${error.message}`);
    process.exitCode = 1;
  });
  try {
    await Promise.race([
      waitForServices(child),
      exit.then((code) => Promise.reject(new Error(`启动器退出，状态码 ${code}`))),
    ]);
    await exit;
  } catch (error) {
    console.error(`\n${error.message}`);
    if (child.exitCode === null) child.kill('SIGTERM');
    process.exitCode = 1;
  }
}
