'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '../../lib/supabase/server';

export async function postLockerMessage(formData: FormData) {
  const supabase = await createClient();
  const { data:{user} } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const leagueId = String(formData.get('league_id') ?? '');
  const body = String(formData.get('body') ?? '');
  const { error } = await supabase.rpc('post_locker_room_message',{ p_league_id:leagueId,p_body:body });
  if (error) redirect(`/leagues/${leagueId}/locker-room?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/leagues/${leagueId}/locker-room`);
  redirect(`/leagues/${leagueId}/locker-room?message_status=sent`);
}

export async function toggleReaction(formData: FormData) {
  const supabase = await createClient();
  const { data:{user} } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const leagueId = String(formData.get('league_id') ?? '');
  const eventId = String(formData.get('event_id') ?? '');
  const reaction = String(formData.get('reaction') ?? '');
  const { error } = await supabase.rpc('toggle_feed_reaction',{ p_event_id:eventId,p_reaction:reaction });
  if (error) redirect(`/leagues/${leagueId}/locker-room?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/leagues/${leagueId}/locker-room`);
  redirect(`/leagues/${leagueId}/locker-room#event-${eventId}`);
}

export async function proposeTrade(formData: FormData) {
  const supabase = await createClient();
  const { data:{user} } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const leagueId = String(formData.get('league_id') ?? '');
  const leagueSeasonId = String(formData.get('league_season_id') ?? '');
  const toSeasonFranchiseId = String(formData.get('to_season_franchise_id') ?? '');
  const offer = String(formData.get('offer_asset') ?? '');
  const request = String(formData.get('request_asset') ?? '');
  const [offerType,offerId] = offer.split(':');
  const [requestType,requestId] = request.split(':');
  const { data,error } = await supabase.rpc('create_trade_proposal',{
    p_league_season_id:leagueSeasonId,
    p_to_season_franchise_id:toSeasonFranchiseId,
    p_offer_athlete_ids:offerType==='athlete'&&offerId?[offerId]:[],
    p_request_athlete_ids:requestType==='athlete'&&requestId?[requestId]:[],
    p_offer_team_ids:offerType==='team'&&offerId?[offerId]:[],
    p_request_team_ids:requestType==='team'&&requestId?[requestId]:[]
  });
  if (error) redirect(`/leagues/${leagueId}/trades?error=${encodeURIComponent(error.message)}`);
  const tradeId = (data as {trade_id?:string}|null)?.trade_id;
  revalidatePath(`/leagues/${leagueId}/trades`);
  if (!tradeId) redirect(`/leagues/${leagueId}/trades?error=${encodeURIComponent('Trade room was not created')}`);
  redirect(`/trades/${tradeId}`);
}

export async function postTradeRoomMessage(formData: FormData) {
  const supabase = await createClient();
  const { data:{user} } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const tradeId = String(formData.get('trade_id') ?? '');
  const body = String(formData.get('body') ?? '');
  const { error } = await supabase.rpc('post_trade_message',{ p_trade_id:tradeId,p_body:body });
  if (error) redirect(`/trades/${tradeId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/trades/${tradeId}`);
  redirect(`/trades/${tradeId}`);
}

export async function resolveTradeAction(formData: FormData) {
  const supabase = await createClient();
  const { data:{user} } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const tradeId = String(formData.get('trade_id') ?? '');
  const action = String(formData.get('trade_action') ?? '');
  const { error } = await supabase.rpc('resolve_trade',{ p_trade_id:tradeId,p_action:action });
  if (error) redirect(`/trades/${tradeId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/trades/${tradeId}`);
  redirect(`/trades/${tradeId}?resolved=${encodeURIComponent(action)}`);
}

export async function generateAwards(formData: FormData) {
  const supabase = await createClient();
  const { data:{user} } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const leagueId = String(formData.get('league_id') ?? '');
  const week = Number(formData.get('week') ?? 1);
  const { error } = await supabase.rpc('generate_weekly_awards',{ p_league_id:leagueId,p_week:week });
  if (error) redirect(`/leagues/${leagueId}/locker-room?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/leagues/${leagueId}/locker-room`);
  redirect(`/leagues/${leagueId}/locker-room?awards=${week}`);
}
