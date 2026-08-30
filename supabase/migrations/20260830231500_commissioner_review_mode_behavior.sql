-- Commissioner Review is intentionally stricter than Automatic Protection.
-- After the trade deadline, every transaction that releases a roster asset
-- requires a one-time commissioner override in this mode.

create or replace function public.evaluate_roster_integrity_drop(
  p_roster_entry_id uuid,
  p_context text default 'direct'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_entry roster_entries%rowtype;
  v_sf season_franchises%rowtype;
  v_ls league_seasons%rowtype;
  v_recent_drops integer:=0;
  v_override uuid;
  v_protected boolean:=false;
  v_message text;
begin
  select * into v_entry from roster_entries where id=p_roster_entry_id;
  if v_entry.id is null or v_entry.dropped_at is not null then
    return jsonb_build_object('allowed',false,'reason_code','missing_asset','message','Roster asset is no longer active.');
  end if;

  select * into v_sf from season_franchises where id=v_entry.season_franchise_id;
  select * into v_ls from league_seasons where id=v_sf.league_season_id;
  if v_ls.id is null then
    return jsonb_build_object('allowed',false,'reason_code','missing_season','message','League season not found.');
  end if;

  if v_ls.trade_deadline_at is null or now()<v_ls.trade_deadline_at or v_ls.roster_integrity_mode='open' then
    return jsonb_build_object('allowed',true,'reason_code','not_active','mode',v_ls.roster_integrity_mode);
  end if;

  select id into v_override
  from roster_integrity_overrides
  where roster_entry_id=p_roster_entry_id
    and consumed_at is null and expires_at>now()
  order by approved_at desc limit 1;
  if v_override is not null then
    return jsonb_build_object('allowed',true,'reason_code','commissioner_override','override_id',v_override,'mode',v_ls.roster_integrity_mode);
  end if;

  if v_ls.roster_integrity_lock_eliminated and v_sf.roster_locked_at is not null then
    v_message:='This franchise roster is locked for the remainder of the season.';
    return jsonb_build_object('allowed',false,'reason_code','franchise_locked','message',v_message,'requires_review',true,'mode',v_ls.roster_integrity_mode);
  end if;

  if v_ls.roster_integrity_mode='commissioner_review' then
    v_message:='This league requires commissioner approval for every roster release after the trade deadline.';
    return jsonb_build_object('allowed',false,'reason_code','commissioner_review_required','message',v_message,'requires_review',true,'mode',v_ls.roster_integrity_mode);
  end if;

  if v_ls.roster_integrity_protect_core_assets then
    v_protected:=roster_integrity_asset_is_protected(p_roster_entry_id);
    if v_protected then
      v_message:='This core roster asset is protected after the trade deadline. Commissioner approval is required to release it.';
      return jsonb_build_object('allowed',false,'reason_code','protected_asset','message',v_message,'requires_review',true,'mode',v_ls.roster_integrity_mode);
    end if;
  end if;

  select count(*) into v_recent_drops
  from roster_entries
  where season_franchise_id=v_entry.season_franchise_id
    and dropped_at is not null
    and dropped_at>=now()-make_interval(hours=>v_ls.roster_integrity_bulk_window_hours);

  if v_recent_drops>=v_ls.roster_integrity_bulk_drop_limit then
    v_message:=format('Roster Integrity blocked this move because the franchise already made %s drops in the last %s hours. Commissioner approval is required.',v_recent_drops,v_ls.roster_integrity_bulk_window_hours);
    return jsonb_build_object('allowed',false,'reason_code','bulk_drop_limit','message',v_message,'requires_review',true,'recent_drops',v_recent_drops,'mode',v_ls.roster_integrity_mode);
  end if;

  if coalesce(p_context,'direct')='direct' then
    v_message:='Standalone player releases are protected after the trade deadline. Use Free Agency/Waivers for a replacement move or request commissioner approval.';
    return jsonb_build_object('allowed',false,'reason_code','standalone_drop','message',v_message,'requires_review',true,'mode',v_ls.roster_integrity_mode);
  end if;

  return jsonb_build_object('allowed',true,'reason_code','normal_replacement','mode',v_ls.roster_integrity_mode,'recent_drops',v_recent_drops);
end
$function$;

revoke execute on function public.evaluate_roster_integrity_drop(uuid,text) from public,anon,authenticated;
