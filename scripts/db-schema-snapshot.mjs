#!/usr/bin/env node
/**
 * Regenerates supabase/schema/*.sql from the live Postgres catalog (schema `public`).
 *
 * READ-ONLY: every statement this script sends is a SELECT against the system
 * catalog. It never writes to the database and never reads table rows, vault
 * contents, or the internals of the auth/storage/vault schemas.
 *
 * Usage (direct connection, needs `psql` on PATH):
 *   SUPABASE_DB_URL='postgres://...' node scripts/db-schema-snapshot.mjs
 *
 * Usage (rows fetched some other way, e.g. through the Supabase MCP server):
 *   node scripts/db-schema-snapshot.mjs --print-query <key> [limit offset]
 *   node scripts/db-schema-snapshot.mjs --from-json rows.json
 *     rows.json = { "<key>": [ { "ord": "...", "text": "..." }, ... ], "meta": [ {...} ] }
 *
 * Recovering migrations that exist only in production's history:
 *   node scripts/db-schema-snapshot.mjs --print-query migrations_index
 *   node scripts/db-schema-snapshot.mjs --print-query migration_sql   (add a version filter)
 *   node scripts/db-schema-snapshot.mjs --from-json rows.json --recover-migrations
 *
 * The connection string is read only from the environment. Never hard-code it.
 *
 * Secret handling: any text that looks like a JWT, a Supabase secret key, a
 * bearer token or a provider API key is replaced with <REDACTED> before it is
 * written, and the location is printed.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = resolve(ROOT, 'supabase', 'schema');
const RECOVERED_DIR = resolve(ROOT, 'supabase', 'migrations_recovered');
const MIGRATIONS_DIR = resolve(ROOT, 'supabase', 'migrations');

/** Each query returns (ord text, text text). `ord` is the stable sort key. */
export const QUERIES = {
  types: `
select t.typname::text as ord,
       format('CREATE TYPE public.%I AS ENUM (%s);', t.typname,
              string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder)) as text
from pg_type t
join pg_namespace n on n.oid = t.typnamespace
join pg_enum e on e.enumtypid = t.oid
where n.nspname = 'public'
group by t.typname`,

  tables: `
select c.relname::text as ord,
       format(E'CREATE TABLE public.%I (\\n%s\\n);', c.relname,
         (select string_agg(
                   format('  %I %s%s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
                     case when a.attidentity <> '' then ' GENERATED ' || case a.attidentity when 'a' then 'ALWAYS' else 'BY DEFAULT' end || ' AS IDENTITY' else '' end,
                     case when a.attgenerated <> '' then ' GENERATED ALWAYS AS (' || pg_get_expr(d.adbin, d.adrelid) || ') STORED'
                          when d.adbin is not null then ' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid)
                          else '' end,
                     case when a.attnotnull then ' NOT NULL' else '' end),
                   E',\\n' order by a.attnum)
            from pg_attribute a
            left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
           where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped))
       || coalesce(E'\\n' || (
            select string_agg(
                     format('ALTER TABLE public.%I ADD CONSTRAINT %I %s;', c.relname, con.conname, pg_get_constraintdef(con.oid)),
                     E'\\n' order by array_position(array['p','u','c','x','f'], con.contype::text), con.conname)
              from pg_constraint con
             where con.conrelid = c.oid and con.contype::text in ('p','u','c','x','f')), '') as text
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','p')`,

  views: `
select c.relname::text as ord,
       format(E'-- reloptions: %s\\nCREATE OR REPLACE VIEW public.%I AS\\n%s', coalesce(array_to_string(c.reloptions, ', '), '(none)'), c.relname, pg_get_viewdef(c.oid, true)) as text
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('v','m')`,

  indexes: `
select (i.tablename || '.' || i.indexname)::text as ord, i.indexdef || ';' as text
from pg_indexes i
where i.schemaname = 'public'`,

  functions: `
select (p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')')::text as ord,
       pg_get_functiondef(p.oid) as text
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind in ('f','p')`,

  triggers: `
select (c.relname || '.' || t.tgname)::text as ord, pg_get_triggerdef(t.oid, true) || ';' as text
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and not t.tgisinternal`,

  triggers_external: `
select (n.nspname || '.' || c.relname || '.' || t.tgname)::text as ord, pg_get_triggerdef(t.oid, true) || ';' as text
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
join pg_namespace pn on pn.oid = p.pronamespace
where pn.nspname = 'public' and n.nspname <> 'public' and not t.tgisinternal`,

  rls: `
select c.relname::text as ord,
       case when c.relrowsecurity
            then format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', c.relname)
            else format('-- RLS DISABLED on public.%I', c.relname) end
       || case when c.relforcerowsecurity then format(E'\\nALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', c.relname) else '' end as text
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','p')`,

  policies: `
select (pol.tablename || '.' || pol.policyname)::text as ord,
       format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s;',
              pol.policyname, pol.tablename, pol.permissive, pol.cmd, array_to_string(pol.roles, ', '),
              case when pol.qual is not null then E'\\n  USING (' || pol.qual || ')' else '' end,
              case when pol.with_check is not null then E'\\n  WITH CHECK (' || pol.with_check || ')' else '' end) as text
from pg_policies pol
where pol.schemaname = 'public'`,

  grants_tables: `
select (c.relname || '.' || r.rolname)::text as ord,
       format('GRANT %s ON public.%I TO %I;', string_agg(p.priv, ', ' order by p.priv), c.relname, r.rolname) as text
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join (values ('anon'), ('authenticated'), ('service_role')) r(rolname)
cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p(priv)
where n.nspname = 'public' and c.relkind in ('r','p','v','m')
  and has_table_privilege(r.rolname, c.oid, p.priv)
group by c.relname, r.rolname`,

  grants_columns: `
select (cp.table_name || '.' || cp.grantee || '.' || cp.privilege_type)::text as ord,
       format('GRANT %s (%s) ON public.%I TO %I;', cp.privilege_type, string_agg(quote_ident(cp.column_name), ', ' order by cp.column_name), cp.table_name, cp.grantee) as text
from information_schema.column_privileges cp
where cp.table_schema = 'public' and cp.grantee in ('anon', 'authenticated', 'service_role')
  and not has_table_privilege(cp.grantee, format('public.%I', cp.table_name)::regclass, cp.privilege_type)
group by cp.table_name, cp.grantee, cp.privilege_type`,

  grants_functions: `
select (p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')')::text as ord,
       case when g.grantees = ''
            then format('-- no EXECUTE for PUBLIC/anon/authenticated/service_role: public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid))
            else format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO %s;', p.proname, pg_get_function_identity_arguments(p.oid), g.grantees) end as text
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral (select concat_ws(', ',
         case when p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') then 'PUBLIC' end,
         case when has_function_privilege('anon', p.oid, 'EXECUTE') then 'anon' end,
         case when has_function_privilege('authenticated', p.oid, 'EXECUTE') then 'authenticated' end,
         case when has_function_privilege('service_role', p.oid, 'EXECUTE') then 'service_role' end) as grantees) g
where n.nspname = 'public' and p.prokind in ('f','p')`,

  // Only run when to_regclass('cron.job') is not null (see `meta.has_cron`).
  cron: `
select coalesce(j.jobname, j.jobid::text)::text as ord,
       format(E'-- active: %s\\nselect cron.schedule(%L, %L, %L);', j.active, j.jobname, j.schedule, j.command) as text
from cron.job j`,

  extensions: `
select e.extname::text as ord,
       format('CREATE EXTENSION IF NOT EXISTS %I WITH SCHEMA %I VERSION %L;', e.extname, n.nspname, e.extversion) as text
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace`,
};

/** One row of counts used to verify nothing was truncated. */
export const META_QUERY = `
select to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as generated_at,
       (to_regclass('cron.job') is not null) as has_cron,
       (select count(*) from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typtype = 'e') as types,
       (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r','p')) as tables,
       (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('v','m')) as views,
       (select count(*) from pg_indexes where schemaname = 'public') as indexes,
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public') as functions,
       (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not t.tgisinternal) as triggers,
       (select count(*) from pg_policies where schemaname = 'public') as policies,
       (select count(*) from pg_extension) as extensions,
       (select count(*) from supabase_migrations.schema_migrations) as migrations`;

export const MIGRATION_QUERIES = {
  migrations_index: `
select m.version::text as ord, m.name::text as text,
       coalesce(array_length(m.statements, 1), 0) as n_statements,
       length(array_to_string(m.statements, E'\\n')) as chars
from supabase_migrations.schema_migrations m`,
  // text = statements joined with a blank line; `chars` lets the caller prove the value arrived intact.
  migration_sql: `
select m.version::text as ord, array_to_string(m.statements, E'\\n\\n') as text,
       length(array_to_string(m.statements, E'\\n\\n')) as chars
from supabase_migrations.schema_migrations m`,
};

const FILES = [
  ['types.sql', 'Enum types in schema public.', ['types']],
  ['tables.sql', 'Tables (columns, defaults, NOT NULL, then PK / UNIQUE / CHECK / EXCLUDE / FK constraints) and views in schema public.', ['tables', 'views']],
  ['indexes.sql', 'Every index in schema public (including the ones that back PK/UNIQUE constraints).', ['indexes']],
  ['functions.sql', 'Every function in schema public via pg_get_functiondef, ordered by name and argument list.', ['functions']],
  ['triggers.sql', 'Triggers on public tables, then triggers on other schemas that execute a public function.', ['triggers', 'triggers_external']],
  ['policies.sql', 'Row level security flags for every public table, then every policy.', ['rls', 'policies']],
  ['grants.sql', 'EFFECTIVE privileges of anon, authenticated and service_role (has_*_privilege, so grants inherited through PUBLIC are included). Function lines also name PUBLIC when the function ACL grants it.', ['grants_tables', 'grants_columns', 'grants_functions']],
  ['cron.sql', 'pg_cron jobs (name, schedule, command).', ['cron']],
  ['extensions.sql', 'Installed extensions.', ['extensions']],
];

const SECRET_PATTERNS = [
  ['jwt', /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g],
  ['supabase_secret_key', /sb_secret_[A-Za-z0-9_-]+/g],
  ['supabase_access_token', /sbp_[A-Za-z0-9]{20,}/g],
  ['bearer_token', /(?<=Bearer\s+)[A-Za-z0-9._~+/-]{16,}=*/g],
  ['api_key', /\b(?:sk|rk|pk)[-_](?:live|test|proj|ant)?[-_]?[A-Za-z0-9_-]{20,}/g],
  ['long_opaque_literal', /(?<=')[A-Za-z0-9+/_-]{48,}=*(?=')/g],
];

export function redact(text, location, log) {
  let out = text;
  for (const [kind, re] of SECRET_PATTERNS) {
    out = out.replace(re, () => {
      log.push(`${location}: ${kind}`);
      return '<REDACTED>';
    });
  }
  return out;
}

export function wrap(key, sql, limit, offset) {
  const page = limit ? ` limit ${Number(limit)} offset ${Number(offset || 0)}` : '';
  return `select '${key}' as k, q.* from (${sql.trim()}) q order by q.ord${page}`;
}

function psqlJson(url, sql) {
  const res = spawnSync('psql', [url, '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c',
    `select coalesce(json_agg(t), '[]'::json) from (${sql}) t`], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (res.status !== 0) throw new Error(`psql failed: ${res.stderr || res.error}`);
  return JSON.parse(res.stdout);
}

function sortRows(rows) {
  return [...rows].sort((a, b) => (a.ord < b.ord ? -1 : a.ord > b.ord ? 1 : 0));
}

function commentBlock(sql) {
  return sql.trim().split('\n').map((line) => `--   ${line}`.trimEnd()).join('\n');
}

export function buildFiles(rowsByKey, meta, log) {
  const expected = { types: meta.types, tables: meta.tables, views: meta.views, indexes: meta.indexes,
    functions: meta.functions, triggers: meta.triggers, policies: meta.policies, rls: meta.tables,
    grants_functions: meta.functions, extensions: meta.extensions };
  const out = {};
  for (const [file, description, keys] of FILES) {
    let body = `-- ${file} — ${description}\n-- Generated: ${meta.generated_at} (UTC) by scripts/db-schema-snapshot.mjs\n`
      + '-- Source: live Postgres catalog. Reference snapshot only; do NOT apply this file.\n';
    for (const key of keys) {
      const rows = sortRows(rowsByKey[key] || []);
      if (key in expected && Number(expected[key]) !== rows.length) {
        throw new Error(`${key}: have ${rows.length} rows, catalog count is ${expected[key]}`);
      }
      if (new Set(rows.map((r) => r.ord)).size !== rows.length) throw new Error(`${key}: duplicate ord values`);
      body += `\n-- ===== ${key}: ${rows.length} object(s) =====\n-- Query:\n${commentBlock(QUERIES[key])}\n`;
      if (key === 'cron' && !meta.has_cron) body += '-- pg_cron is not installed (cron.job does not exist).\n';
      for (const row of rows) {
        let text = redact(String(row.text), `supabase/schema/${file} :: ${key} ${row.ord}`, log);
        if (key === 'functions') text = `${text.replace(/\n+$/, '')};`;
        body += `\n-- ${row.ord}\n${text}\n`;
      }
    }
    out[file] = body;
  }
  return out;
}

export function reconcile(index) {
  const strip = (name) => name.replace(/_20\d{6}$/, '');
  const repo = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort().map((file) => {
    const m = file.match(/^(\d+)_(.*)\.sql$/);
    return { file, version: m[1], name: m[2] };
  });
  const used = new Set();
  const rows = sortRows(index).map((p) => {
    const hit = repo.find((r) => !used.has(r.file) && strip(r.name) === strip(p.text));
    if (hit) used.add(hit.file);
    return { version: p.ord, name: p.text, chars: p.chars, repo: hit || null };
  });
  return { rows, repoOnly: repo.filter((r) => !used.has(r.file)) };
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--print-query') {
    const key = args[1];
    const sql = key === 'meta' ? null : (QUERIES[key] || MIGRATION_QUERIES[key]);
    if (key === 'meta') return void console.log(META_QUERY.trim());
    if (!sql) throw new Error(`unknown query key: ${key}`);
    return void console.log(wrap(key, sql, args[2], args[3]));
  }

  let rowsByKey;
  const fromJson = args.indexOf('--from-json');
  if (fromJson >= 0) {
    rowsByKey = JSON.parse(readFileSync(resolve(ROOT, args[fromJson + 1]), 'utf8'));
  } else {
    const url = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
    if (!url) throw new Error('Set SUPABASE_DB_URL (or DATABASE_URL), or pass --from-json <file>.');
    rowsByKey = { meta: psqlJson(url, META_QUERY) };
    for (const [key, sql] of Object.entries(QUERIES)) {
      rowsByKey[key] = key === 'cron' && !rowsByKey.meta[0].has_cron ? [] : psqlJson(url, sql);
    }
    if (args.includes('--recover-migrations')) {
      for (const [key, sql] of Object.entries(MIGRATION_QUERIES)) rowsByKey[key] = psqlJson(url, sql);
    }
  }

  const meta = rowsByKey.meta[0];
  const log = [];
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [file, body] of Object.entries(buildFiles(rowsByKey, meta, log))) {
    writeFileSync(join(OUT_DIR, file), body);
  }
  console.log(`wrote ${FILES.length} files to supabase/schema (catalog time ${meta.generated_at})`);

  if (args.includes('--recover-migrations')) {
    const { rows, repoOnly } = reconcile(rowsByKey.migrations_index);
    const sqlByVersion = new Map((rowsByKey.migration_sql || []).map((r) => [r.ord, r]));
    mkdirSync(RECOVERED_DIR, { recursive: true });
    const report = { matched: 0, missing: 0, recovered: 0, notRecovered: [] };
    for (const row of rows) {
      if (row.repo) { report.matched += 1; continue; }
      report.missing += 1;
      const got = sqlByVersion.get(row.version);
      if (!got || Array.from(got.text).length !== Number(got.chars)) { report.notRecovered.push(`${row.version}_${row.name}`); continue; }
      const file = `${row.version}_${row.name}.sql`;
      const header = `-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).\n`
        + `-- version ${row.version}, name ${row.name}. Retrieved ${meta.generated_at} (UTC).\n`
        + '-- Already applied in production. Kept for the record only; do NOT re-apply.\n\n';
      writeFileSync(join(RECOVERED_DIR, file), `${header}${redact(got.text, `supabase/migrations_recovered/${file}`, log)}\n`);
      report.recovered += 1;
    }
    writeFileSync(join(OUT_DIR, 'migration-reconciliation.json'), `${JSON.stringify({ rows, repoOnly }, null, 2)}\n`);
    console.log(JSON.stringify({ ...report, repoOnly: repoOnly.map((r) => r.file) }, null, 2));
  }

  console.log(log.length ? `REDACTED ${log.length} value(s):\n${log.join('\n')}` : 'no secret-like values found');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
