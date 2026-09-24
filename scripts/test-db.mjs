#!/usr/bin/env node
/**
 * Database security tests.
 *
 * Replays every migration in supabase/migrations on a throwaway PostgreSQL database (with a
 * small stand-in for Supabase's auth/storage/vault/pg_net), then runs supabase/tests/sql/*.sql.
 * Each test file runs inside a transaction that is rolled back.
 *
 * Needs: `psql` on PATH, and a PostgreSQL 15+ server you can create databases on, e.g.
 *   docker run --rm -d -p 5433:5432 -e POSTGRES_PASSWORD=postgres postgres:16
 *   set TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres   (PowerShell: $env:TEST_DATABASE_URL="...")
 *   npm run test:db
 *
 * It creates a new database for the run and drops it afterwards. It refuses to run against
 * Supabase-hosted databases, so it can never touch your live data.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'supabase', 'migrations');
const testsDir = path.join(root, 'supabase', 'tests', 'sql');
const shimFile = path.join(root, 'supabase', 'tests', 'supabase_shim.sql');

const adminUrl = process.env.TEST_DATABASE_URL;
if (!adminUrl) {
  console.error('Set TEST_DATABASE_URL to a PostgreSQL server you can create databases on (see the top of scripts/test-db.mjs).');
  process.exit(2);
}
const parsed = new URL(adminUrl);
if (/supabase\.(co|com|net)$/i.test(parsed.hostname) || parsed.hostname.includes('pooler')) {
  console.error('Refusing to run tests against a Supabase-hosted database. Use a local or throwaway PostgreSQL.');
  process.exit(2);
}

const dbName = `app_test_${Date.now()}`;
const testUrl = new URL(adminUrl);
testUrl.pathname = `/${dbName}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dbtest-'));

function psql(url, args, input) {
  const res = spawnSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', url.toString(), ...args], {
    input,
    encoding: 'utf8',
  });
  if (res.error) {
    console.error(`Could not run psql (${res.error.message}). Install PostgreSQL client tools and make sure psql is on PATH.`);
    process.exit(2);
  }
  return res;
}

function runFile(url, sql, single) {
  const file = path.join(tmp, 'step.sql');
  fs.writeFileSync(file, sql);
  return psql(url, [...(single ? ['-1'] : []), '-f', file]);
}

const errors = out => (out.stderr || '').split('\n').filter(l => /ERROR|CONTEXT/.test(l)).slice(0, 4).join('\n');

let failed = 0;
let created = false;
try {
  const create = psql(adminUrl, ['-c', `CREATE DATABASE "${dbName}"`]);
  if (create.status !== 0) throw new Error(`could not create test database:\n${create.stderr}`);
  created = true;

  const shim = runFile(testUrl, fs.readFileSync(shimFile, 'utf8'), true);
  if (shim.status !== 0) throw new Error(`shim failed:\n${errors(shim)}`);

  for (const name of fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()) {
    // pg_net isn't available on plain PostgreSQL; the shim provides net.http_post instead.
    const sql = fs.readFileSync(path.join(migrationsDir, name), 'utf8')
      .replace(/^\s*CREATE EXTENSION IF NOT EXISTS "?pg_net"?[^;]*;/gim, '');
    const res = runFile(testUrl, sql, true);
    if (res.status !== 0) throw new Error(`migration ${name} failed:\n${errors(res)}`);
  }
  console.log('migrations applied');

  const files = fs.readdirSync(testsDir).filter(f => f.endsWith('.sql')).sort();
  const helpers = files.find(f => f.startsWith('00_'));
  if (helpers) {
    const res = runFile(testUrl, fs.readFileSync(path.join(testsDir, helpers), 'utf8'), true);
    if (res.status !== 0) throw new Error(`test helpers failed:\n${errors(res)}`);
  }
  for (const name of files.filter(f => f !== helpers)) {
    const sql = `BEGIN;\n${fs.readFileSync(path.join(testsDir, name), 'utf8')}\nROLLBACK;\n`;
    const res = runFile(testUrl, sql, false);
    if (res.status === 0) {
      console.log(`PASS ${name}`);
    } else {
      failed++;
      console.log(`FAIL ${name}\n${errors(res)}`);
    }
  }
} catch (err) {
  failed++;
  console.error(err instanceof Error ? err.message : err);
} finally {
  if (created) psql(adminUrl, ['-c', `DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`]);
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(failed ? `\n${failed} failed` : '\nall database tests passed');
process.exit(failed ? 1 : 0);
