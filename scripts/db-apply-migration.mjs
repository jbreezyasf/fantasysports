#!/usr/bin/env node
/**
 * Applies one checked-in migration to the linked Supabase project.
 *
 * Why this exists: `supabase db push --linked` has been blocked since 2026-08-26
 * by pre-existing remote/local migration-history drift (see docs/GATE_STATUS.md).
 * The established production apply path in this repository is
 * `npx supabase db query --linked --file`, used for the Draft Night SQL. This
 * script makes that path explicit and adds guardrails:
 *
 *   - only a file under supabase/migrations/ is accepted;
 *   - the statement is wrapped in a single transaction unless it already is, so a
 *     failure anywhere leaves the database untouched;
 *   - the target project ref is printed before anything runs.
 *
 * Usage: npm run db:apply -- supabase/migrations/<file>.sql
 *
 * This does NOT record the migration in the remote migration history. Until the
 * drift is reconciled, that is the same limitation every prior direct apply had.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';

const target = process.argv[2];
if (!target) {
  console.error('usage: npm run db:apply -- supabase/migrations/<file>.sql');
  process.exit(2);
}

const migrationsDir = resolve(process.cwd(), 'supabase', 'migrations');
const file = resolve(process.cwd(), target);
if (!file.startsWith(migrationsDir + '/') || !file.endsWith('.sql') || !existsSync(file)) {
  console.error(`refusing: ${target} is not an existing .sql file under supabase/migrations/`);
  process.exit(2);
}

const projectRefFile = resolve(process.cwd(), 'supabase', '.temp', 'project-ref');
const projectRef = existsSync(projectRefFile) ? readFileSync(projectRefFile, 'utf8').trim() : '(not linked)';

let sql = readFileSync(file, 'utf8');
const alreadyTransactional = /^\s*begin\s*;/i.test(sql);
if (!alreadyTransactional) sql = `begin;\n${sql}\ncommit;\n`;

console.log(`applying ${relative(process.cwd(), file)} to linked project ${projectRef} (${alreadyTransactional ? 'file-managed' : 'wrapped'} transaction)`);

const tempDir = await mkdtemp(join(tmpdir(), 'big-exec-db-apply-'));
const tempFile = join(tempDir, 'apply.sql');
try {
  await writeFile(tempFile, sql, 'utf8');
  const result = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '--file', tempFile], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log('applied');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
