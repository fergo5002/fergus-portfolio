import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { localEnvironment, worktreeIdentity } from './worktree-runtime.mjs';
import { assertPortAvailable, claimServer, verifyServer } from './worktree-server-proof.mjs';

const root = realpathSync('.');
const { id, port } = worktreeIdentity(root);
const base = `http://127.0.0.1:${port}`;
const command = process.argv[2] ?? 'info';
const commands = {
  build: ['node_modules/next/dist/bin/next', 'build'],
  dev: ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)],
  start: ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)],
  arcade: ['scripts/arcade-phone-check.mjs', '--base', base, '--out', `.codex/results/${id}/arcade`],
  phone: ['scripts/phone-check.mjs', '--base', base, '--from-sitemap', '--out', `.codex/results/${id}/phone`],
};
if (command === 'info') console.log(JSON.stringify({ root, id, base, commands }, null, 2));
else {
  if (!commands[command]) throw new Error('Use info, build, dev, start, phone or arcade');
  // Next loads .env files itself: refuse rather than accidentally use a copied production file.
  const { existsSync } = await import('node:fs');
  const files = ['.env', '.env.local', '.env.development', '.env.development.local', '.env.production', '.env.production.local'];
  if (files.some(file => existsSync(resolve(root, file)))) throw new Error('Isolated preview requires a worktree without .env files. Use local fixtures and explicit test adapters.');
  const out = resolve(root, '.codex/results', id);
  mkdirSync(out, { recursive: true });
  const startedAt = new Date().toISOString();
  const server = command === 'dev' || command === 'start';
  if (command === 'start') {
    const build = JSON.parse(readFileSync(resolve(out, 'build.json'), 'utf8'));
    if (build.exitCode !== 0 || build.root !== root || build.buildId !== readFileSync(resolve(root, '.next/BUILD_ID'), 'utf8').trim()) throw new Error('Run a successful guarded build before starting this preview.');
  }
  if (server) await assertPortAvailable(port);
  const release = server || command === 'build' ? claimServer(root, id) : () => {};
  if (command === 'phone' || command === 'arcade') await verifyServer(root, id, base);
  process.on('exit', release);
  console.log(`[worktree] ${base} (${root})`);
  const child = spawn(process.execPath, commands[command], { cwd: root, env: { ...localEnvironment(), NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['inherit', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
  let startup = '';
  child.stdout.on('data', data => {
    process.stdout.write(data);
    if (server && !stopping) {
      startup = (startup + data.toString()).slice(-1024);
      if (/Ready in \d/.test(startup)) { release.ready(child.pid); startup = ''; }
    }
  });
  child.stderr.on('data', data => process.stderr.write(data));
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    if (stopping) return;
    stopping = true;
    release();
    if (child.pid) {
      if (process.platform === 'win32') {
        // This PID was created above. Stop only its descendant process tree.
        const stop = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
        stop.on('error', () => child.kill());
      } else {
        try { process.kill(-child.pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; }
      }
    }
  });
  child.on('error', error => { release(); console.error(error.message); process.exitCode = 1; });
  child.on('exit', (code, signal) => {
    release();
    const buildId = command === 'build' && code === 0 ? readFileSync(resolve(root, '.next/BUILD_ID'), 'utf8').trim() : undefined;
    writeFileSync(resolve(out, `${command}.json`), JSON.stringify({ root, command, base, startedAt, finishedAt: new Date().toISOString(), exitCode: code, signal, buildId }, null, 2));
    process.exitCode = code ?? 1;
  });
}
