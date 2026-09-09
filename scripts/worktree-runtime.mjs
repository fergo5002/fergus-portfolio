// Local verification infrastructure. No credentials or provider configuration inherited.
import { createHash } from 'node:crypto';

export function worktreeIdentity(root) {
  const canonical = process.platform === 'win32' ? root.toLowerCase() : root;
  const id = createHash('sha256').update(canonical.replaceAll('\\', '/')).digest('hex').slice(0, 12);
  return { id, port: 12000 + (parseInt(id.slice(0, 7), 16) % 18000) * 2 };
}

export function localEnvironment(source = process.env) {
  const allowed = /^(path|pathext|systemroot|windir|comspec|temp|tmp|home|userprofile|appdata|localappdata|programfiles|programfiles\(x86\)|programdata|username|number_of_processors|processor_architecture)$/i;
  return Object.fromEntries(Object.entries(source).filter(([key]) => allowed.test(key)));
}

