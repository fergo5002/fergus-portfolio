import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:net';

export async function assertPortAvailable(port) {
  const probe = createServer();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(port, '127.0.0.1', resolve); });
  await new Promise(resolve => probe.close(resolve));
}

export function serverProof(root, id) {
  const path = resolve(root, 'public', `codex-worktree-${id}.txt`);
  const urlPath = `/codex-worktree-${id}.txt`;
  return { path, urlPath };
}

export function claimServer(root, id) {
  const { path } = serverProof(root, id);
  if (existsSync(path)) {
    const previous = JSON.parse(readFileSync(path, 'utf8'));
    let live = true;
    try { process.kill(previous.pid, 0); } catch (error) {
      if (error.code === 'ESRCH') live = false;
      else throw error;
    }
    if (live) throw new Error('This worktree already has a preview launcher running.');
    unlinkSync(path);
  }
  const proof = { root, id, pid: process.pid, nonce: randomUUID(), ready: false };
  writeFileSync(path, JSON.stringify(proof), { flag: 'wx' });
  const release = () => {
    if (existsSync(path) && JSON.parse(readFileSync(path, 'utf8')).nonce === proof.nonce) unlinkSync(path);
  };
  release.ready = childPid => {
    proof.ready = true;
    proof.childPid = childPid;
    writeFileSync(path, JSON.stringify(proof));
  };
  return release;
}

export async function verifyServer(root, id, base, request = fetch) {
  const { path, urlPath } = serverProof(root, id);
  if (!existsSync(path)) throw new Error('Start this worktree with worktree-local.mjs first.');
  const expected = JSON.parse(readFileSync(path, 'utf8'));
  if (expected.root !== root || expected.id !== id) throw new Error('Wrong worktree proof');
  if (!expected.ready) throw new Error('This preview has not reported ready yet.');
  process.kill(expected.pid, 0);
  process.kill(expected.childPid, 0);
  const response = await request(`${base}${urlPath}`, { signal: AbortSignal.timeout(30000), redirect: 'error', cache: 'no-store' });
  if (!response.ok || (await response.text()) !== JSON.stringify(expected)) throw new Error('The server on this port does not belong to this preview.');
}
