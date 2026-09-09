import test from 'node:test';
import assert from 'node:assert/strict';
import { localEnvironment, worktreeIdentity } from './worktree-runtime.mjs';

test('provider credentials, database URLs and Node injection do not cross into test processes', () => {
  const clean = localEnvironment({ Path: '/bin', SystemRoot: 'C:/Windows', DATABASE_URL: 'postgres://live', STRIPE_SECRET_KEY: 'live', NODE_OPTIONS: '--require malicious', COMPOSE_FILE: 'other.yml', DOCKER_HOST: 'remote', VERCEL_TOKEN: 'secret' });
  assert.deepEqual(clean, { Path: '/bin', SystemRoot: 'C:/Windows' });
});
test('worktrees have stable separate identities and bounded ports', () => {
  const a = worktreeIdentity('/repo/a');
  assert.deepEqual(a, worktreeIdentity('/repo/a'));
  assert.notEqual(a.id, worktreeIdentity('/repo/b').id);
  assert.ok(a.port >= 12000 && a.port < 48000);
});

test('Windows path spelling gives the same worktree identity', { skip: process.platform !== 'win32' }, () => {
  assert.deepEqual(worktreeIdentity('C:\\Dev\\a'), worktreeIdentity('c:/dev/a'));
});
