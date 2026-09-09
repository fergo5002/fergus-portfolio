import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertPortAvailable, claimServer, serverProof, verifyServer } from './worktree-server-proof.mjs';
import { createServer } from 'node:net';

test('acceptance refuses missing or different server proof and concurrent launchers', async () => {
  const root = mkdtempSync(join(tmpdir(), 'worktree-proof-'));
  mkdirSync(join(root, 'public'));
  let release = () => {};
  try {
    await assert.rejects(verifyServer(root, 'abc', 'http://127.0.0.1:12345'), /Start this worktree/);
    release = claimServer(root, 'abc');
    assert.throws(() => claimServer(root, 'abc'), /already has a preview/);
    await assert.rejects(verifyServer(root, 'abc', 'http://127.0.0.1:12345'), /not reported ready/);
    release.ready(process.pid);
    await assert.rejects(verifyServer(root, 'abc', 'http://127.0.0.1:12345', async () => new Response('wrong server')), /does not belong/);
    const body = readFileSync(serverProof(root, 'abc').path, 'utf8');
    await verifyServer(root, 'abc', 'http://127.0.0.1:12345', async () => new Response(body));
    release();
    await assert.rejects(verifyServer(root, 'abc', 'http://127.0.0.1:12345'), /Start this worktree/);
  } finally { release(); rmSync(root, { recursive: true }); }
});

test('an existing listener prevents a replacement launcher claiming its port', async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await assert.rejects(assertPortAvailable(server.address().port), { code: 'EADDRINUSE' }); }
  finally { await new Promise(resolve => server.close(resolve)); }
});
