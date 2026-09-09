import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('launcher refuses Next environment files before starting any server', () => {
  const root = mkdtempSync(join(tmpdir(), 'worktree-env-'));
  mkdirSync(join(root, 'scripts'));
  for (const file of ['worktree-local.mjs', 'worktree-runtime.mjs', 'worktree-server-proof.mjs']) {
    copyFileSync(new URL(file, import.meta.url), join(root, 'scripts', file));
  }
  writeFileSync(join(root, '.env.local'), 'DATABASE_URL=fixture-not-loaded\n');
  for (const command of ['dev', 'build', 'start']) {
    const result = spawnSync(process.execPath, ['scripts/worktree-local.mjs', command], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /requires a worktree without .env files/);
    assert.doesNotMatch(result.stderr, /Cannot find module/);
  }
});
