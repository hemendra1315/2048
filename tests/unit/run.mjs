// Runs every *.test.mjs in this folder in its own Node process.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
let failed = 0;
for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.test.mjs')).sort()) {
  const res = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', path.join(dir, f)], { encoding: 'utf8' });
  if (res.status === 0) console.log(`PASS ${f}`);
  else { failed++; console.log(`FAIL ${f}\n${(res.stdout + res.stderr).split('\n').slice(-12).join('\n')}`); }
}
console.log(failed ? `\n${failed} failed` : '\nall unit tests passed');
process.exit(failed ? 1 : 0);
