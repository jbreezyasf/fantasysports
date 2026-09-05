#!/usr/bin/env node
/**
 * Prints what each franchise in the current QA season still needs to field a
 * legal lineup, via the authenticated `draft_roster_needs` RPC — the same access
 * path the product's roster-needs guidance will use. Read-only.
 */
import { loadLocalEnv, signInQaActor, resolveQaFixture } from './qa-fixture.mjs';

loadLocalEnv();
const supabase = await signInQaActor('Commissioner');
const fixture = await resolveQaFixture(supabase);

const { data: sfs, error } = await supabase
  .from('season_franchises')
  .select('id,franchises(name)')
  .eq('league_season_id', fixture.season.id);
if (error) throw new Error(error.message);

const rows = [];
for (const sf of sfs) {
  const { data, error: rpcError } = await supabase.rpc('draft_roster_needs', { p_season_franchise_id: sf.id });
  if (rpcError) throw new Error(`draft_roster_needs failed for ${sf.id}: ${rpcError.message}`);
  const name = Array.isArray(sf.franchises) ? sf.franchises[0]?.name : sf.franchises?.name;
  const needs = (data ?? []).map(n => `${n.need_position} x${n.deficit}`).join(', ');
  rows.push({ franchise: name ?? sf.id, needs: needs || '(legal — no needs)', legal: !needs });
}
rows.sort((a, b) => Number(a.legal) - Number(b.legal) || a.franchise.localeCompare(b.franchise));
for (const row of rows) console.log(`${row.legal ? 'LEGAL  ' : 'NEEDS  '} ${row.franchise.padEnd(22)} ${row.needs}`);
console.log(`\nfranchises=${rows.length} legal=${rows.filter(r => r.legal).length} needing=${rows.filter(r => !r.legal).length}`);
