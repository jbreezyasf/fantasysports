import { notFound, redirect } from 'next/navigation';
import { createClient } from '../../../../../lib/supabase/server';
import { resolveRosterIntegrityReview, setFranchiseRosterLock, updateRosterIntegritySettings } from './actions';

export default async function RosterIntegritySettingsPage({
  params,
  searchParams,
}:{
  params:Promise<{leagueId:string}>;
  searchParams:Promise<{status?:string;error?:string}>;
}){
  const {leagueId}=await params;
  const query=await searchParams;
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect('/login');

  const [{data:league},{data:member},{data:leagueSeason}]=await Promise.all([
    supabase.from('fantasy_leagues').select('id,name').eq('id',leagueId).maybeSingle(),
    supabase.from('league_members').select('role').eq('league_id',leagueId).eq('user_id',user.id).maybeSingle(),
    supabase.from('league_seasons').select('id,trade_deadline_at,roster_integrity_mode,roster_integrity_bulk_drop_limit,roster_integrity_bulk_window_hours,roster_integrity_protect_core_assets,roster_integrity_lock_eliminated').eq('league_id',leagueId).eq('is_current',true).maybeSingle(),
  ]);
  if(!league||!leagueSeason)notFound();
  if(member?.role!=='commissioner')redirect(`/leagues/${leagueId}`);

  const [{data:seasonFranchises},{data:franchises},{data:reviews},{data:audit}]=await Promise.all([
    supabase.from('season_franchises').select('id,franchise_id,roster_locked_at,roster_lock_reason').eq('league_season_id',leagueSeason.id),
    supabase.from('franchises').select('id,name,abbreviation').eq('league_id',leagueId),
    supabase.from('roster_integrity_reviews').select('id,season_franchise_id,roster_entry_id,reason_code,reason_detail,manager_note,status,requested_at').eq('league_season_id',leagueSeason.id).order('requested_at',{ascending:false}).limit(50),
    supabase.from('roster_integrity_audit').select('id,season_franchise_id,event_type,created_at').eq('league_season_id',leagueSeason.id).order('created_at',{ascending:false}).limit(20),
  ]);

  const rosterEntryIds=(reviews??[]).map(item=>item.roster_entry_id);
  const {data:reviewRosterEntries}=rosterEntryIds.length
    ? await supabase.from('roster_entries').select('id,athlete_id,real_team_id').in('id',rosterEntryIds)
    : {data:[] as Array<{id:string;athlete_id:string|null;real_team_id:string|null}>};
  const athleteIds=(reviewRosterEntries??[]).map(item=>item.athlete_id).filter((value):value is string=>Boolean(value));
  const teamIds=(reviewRosterEntries??[]).map(item=>item.real_team_id).filter((value):value is string=>Boolean(value));
  const [{data:athletes},{data:realTeams}]=await Promise.all([
    athleteIds.length?supabase.from('athletes').select('id,display_name,position').in('id',athleteIds):Promise.resolve({data:[]}),
    teamIds.length?supabase.from('real_teams').select('id,abbreviation,display_name').in('id',teamIds):Promise.resolve({data:[]}),
  ]);

  const franchiseById=new Map((franchises??[]).map(item=>[item.id,item]));
  const seasonFranchiseById=new Map((seasonFranchises??[]).map(item=>[item.id,item]));
  const rosterById=new Map((reviewRosterEntries??[]).map(item=>[item.id,item]));
  const athleteById=new Map((athletes??[]).map(item=>[item.id,item]));
  const teamById=new Map((realTeams??[]).map(item=>[item.id,item]));
  const pendingReviews=(reviews??[]).filter(item=>item.status==='pending');
  const deadlinePassed=leagueSeason.trade_deadline_at?Date.now()>=new Date(leagueSeason.trade_deadline_at).getTime():false;

  function franchiseLabel(seasonFranchiseId:string){
    const sf=seasonFranchiseById.get(seasonFranchiseId);
    return sf?franchiseById.get(sf.franchise_id)?.name??'Franchise':'Franchise';
  }

  function assetLabel(rosterEntryId:string){
    const entry=rosterById.get(rosterEntryId);
    if(entry?.athlete_id){
      const athlete=athleteById.get(entry.athlete_id);
      return athlete?`${athlete.display_name} • ${athlete.position}`:'Player';
    }
    if(entry?.real_team_id){
      const team=teamById.get(entry.real_team_id);
      return `${team?.abbreviation??team?.display_name??'Team'} D/ST`;
    }
    return 'Roster asset';
  }

  return <main className="leagueShell">
    <section className="leagueHero">
      <div className="leagueHeroGlow"/>
      <div className="leagueTopline"><a className="backLink" href={`/leagues/${leagueId}`}>← LEAGUE HQ</a><span className="leagueRole">COMMISSIONER CONTROL</span></div>
      <div className="leagueHeroContent">
        <p className="eyebrow">BIG EXEC • ROSTER INTEGRITY</p>
        <h1>Protect the league without benching competition.</h1>
        <p className="leagueTagline">Stop post-deadline sabotage while legitimate Free Agency, Waivers, Championship and Redemption management stay active.</p>
        <div className="leagueMetaRow"><span>{league.name}</span><span>{deadlinePassed?'TRADE DEADLINE PASSED':'PRE-DEADLINE'}</span><span>{String(leagueSeason.roster_integrity_mode).replaceAll('_',' ').toUpperCase()}</span></div>
      </div>
    </section>

    {query.status&&<p className="successNotice">Roster Integrity updated: {query.status.replaceAll('_',' ')}.</p>}
    {query.error&&<p className="errorNotice" role="alert">{query.error}</p>}

    <section className="panel">
      <p className="eyebrow">LEAGUE POLICY</p><h2>Roster Integrity Mode</h2>
      <p className="lede">This never reopens trading. The trade deadline remains authoritative and separate.</p>
      <form className="authForm" action={updateRosterIntegritySettings}>
        <input type="hidden" name="league_id" value={leagueId}/>
        <input type="hidden" name="league_season_id" value={leagueSeason.id}/>
        <label>Protection mode
          <select name="mode" defaultValue={leagueSeason.roster_integrity_mode??'automatic'}>
            <option value="automatic">Automatic Protection — recommended default</option>
            <option value="commissioner_review">Commissioner Review — every post-deadline roster release requires approval</option>
            <option value="open">Open Rosters — no extra post-deadline protection</option>
          </select>
        </label>
        <p className="lede"><strong>Automatic:</strong> normal replacement moves stay available; standalone dumps, protected core assets, bulk-drop behavior and locked rosters are stopped. <strong>Commissioner Review:</strong> every post-deadline transaction that releases a roster asset requires a one-time approval. <strong>Open:</strong> disables only these extra integrity rules.</p>
        <label>Automatic-mode bulk-drop limit
          <input name="bulk_drop_limit" type="number" min="1" max="10" defaultValue={leagueSeason.roster_integrity_bulk_drop_limit??3}/>
          <small>Default: after 3 completed drops inside the rolling window, the next release needs approval.</small>
        </label>
        <label>Automatic-mode bulk window (hours)
          <input name="bulk_window_hours" type="number" min="1" max="168" defaultValue={leagueSeason.roster_integrity_bulk_window_hours??24}/>
        </label>
        <label className="checkboxRow"><input name="protect_core_assets" type="checkbox" defaultChecked={leagueSeason.roster_integrity_protect_core_assets??true}/> Protect high-value/core assets using current Big Exec season-to-date scoring ranks</label>
        <label className="checkboxRow"><input name="lock_eliminated" type="checkbox" defaultChecked={leagueSeason.roster_integrity_lock_eliminated??true}/> Enforce explicit roster locks once a franchise is fully out of Championship and Redemption competition</label>
        <button className="primary" type="submit">Save Roster Integrity Settings</button>
      </form>
    </section>

    <section className="panel">
      <div className="sectionTitleRow"><div><p className="eyebrow">COMMISSIONER REVIEW</p><h2>Pending release requests.</h2></div><span className="sectionCounter">{pendingReviews.length}</span></div>
      <p className="lede">Approval creates a one-time, asset-specific 24-hour override. The manager retries the transaction; every other roster, waiver, ownership and game-lock rule still applies.</p>
      {!pendingReviews.length&&<p className="successNotice">No roster-release requests are waiting for review.</p>}
      <div className="playerList">{pendingReviews.map(review=><article className="playerRow" key={review.id}>
        <div><span>{franchiseLabel(review.season_franchise_id)} • {review.reason_code.replaceAll('_',' ').toUpperCase()}</span><strong>{assetLabel(review.roster_entry_id)}</strong><p>{review.reason_detail}</p>{review.manager_note&&<small>Manager note: {review.manager_note}</small>}</div>
        <form className="inlineForm" action={resolveRosterIntegrityReview}>
          <input type="hidden" name="league_id" value={leagueId}/><input type="hidden" name="review_id" value={review.id}/>
          <input name="note" placeholder="Decision note (optional)" aria-label="Decision note"/>
          <button className="primary" name="decision" value="approve" type="submit">Approve 24h Override</button>
          <button className="secondary" name="decision" value="reject" type="submit">Reject</button>
        </form>
      </article>)}</div>
    </section>

    <section className="panel">
      <p className="eyebrow">SEASON-COMPLETE LOCKS</p><h2>Freeze only franchises that are truly finished.</h2>
      <p className="lede">A bad record does not trigger a lock. Use this only when the franchise has no Championship or Redemption competition remaining. Season automation can call the same database control once elimination is deterministically known.</p>
      <div className="playerList">{(seasonFranchises??[]).map(sf=>{
        const franchise=franchiseById.get(sf.franchise_id);
        const locked=Boolean(sf.roster_locked_at);
        return <article className="playerRow" key={sf.id}><div><span>{locked?'ROSTER LOCKED':'ROSTER ACTIVE'}</span><strong>{franchise?.name??'Franchise'}</strong>{sf.roster_lock_reason&&<small>{sf.roster_lock_reason}</small>}</div><form action={setFranchiseRosterLock}><input type="hidden" name="league_id" value={leagueId}/><input type="hidden" name="season_franchise_id" value={sf.id}/><input type="hidden" name="locked" value={locked?'false':'true'}/><button className={locked?'secondary':'primary'} type="submit">{locked?'Unlock Roster':'Lock Finished Roster'}</button></form></article>;
      })}</div>
    </section>

    <section className="panel">
      <p className="eyebrow">AUDIT TRAIL</p><h2>Commissioner actions stay visible.</h2>
      <div className="playerList">{(audit??[]).map(item=><div className="playerRow" key={item.id}><div><span>{new Date(item.created_at).toLocaleString()}</span><strong>{item.event_type.replaceAll('_',' ').toUpperCase()}</strong><small>{item.season_franchise_id?franchiseLabel(item.season_franchise_id):league.name}</small></div></div>)}{!audit?.length&&<p className="successNotice">No Roster Integrity actions recorded yet.</p>}</div>
    </section>
  </main>;
}
