import { NextResponse } from 'next/server';
import {
  isUuid,
  type MachineRouteParams
} from '../../../../../lib/machine/assistantGmApi';
import { createClient } from '../../../../../lib/supabase/server';

export async function GET(request: Request, context: MachineRouteParams) {
  const { leagueId } = await context.params;
  if (!isUuid(leagueId)) return NextResponse.json({ ok: false, code: 'invalid_request', message: 'leagueId must be a UUID.' }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: 'unauthenticated', message: 'Sign in before using this machine API.' }, { status: 401 });

  const [{ data: member }, { data: season }] = await Promise.all([
    supabase.from('league_members').select('role').eq('league_id', leagueId).eq('user_id', user.id).maybeSingle(),
    supabase.from('league_seasons').select('id,competition_season_id').eq('league_id', leagueId).eq('is_current', true).maybeSingle()
  ]);
  if (!member) return NextResponse.json({ ok: false, code: 'unauthorized', message: 'User is not a member of this league.' }, { status: 403 });
  if (!season) return NextResponse.json({ ok: false, code: 'not_found', message: 'Current league season not found.' }, { status: 404 });

  const params = new URL(request.url).searchParams;
  const week = Number(params.get('week') ?? '1');
  const safeWeek = Number.isInteger(week) && week >= 1 && week <= 18 ? week : 1;
  const [{ data: matchups }, { data: games }] = await Promise.all([
    supabase
      .from('matchups')
      .select('id,week,event_type,home_season_franchise_id,away_season_franchise_id,home_points,away_points,is_final')
      .eq('league_season_id', season.id)
      .eq('week', safeWeek)
      .order('id'),
    supabase
      .from('real_games')
      .select('id,week,starts_at,state,home_score,away_score,home_team:home_team_id(display_name,abbreviation),away_team:away_team_id(display_name,abbreviation)')
      .eq('competition_season_id', season.competition_season_id)
      .eq('week', safeWeek)
      .order('starts_at')
  ]);

  return NextResponse.json({
    ok: true,
    leagueId,
    leagueSeasonId: season.id,
    week: safeWeek,
    matchups: matchups ?? [],
    realGames: games ?? []
  });
}
