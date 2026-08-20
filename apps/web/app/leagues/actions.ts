'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '../../lib/supabase/server';
import { sendTransactionalEmail } from '../../lib/email/resend';
import { leagueInviteEmail } from '../../lib/email/templates';

export async function createLeague(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data, error } = await supabase.rpc('create_pro_football_league', {
    p_name: String(formData.get('league_name') ?? ''), p_franchise_name: String(formData.get('franchise_name') ?? ''), p_abbreviation: String(formData.get('abbreviation') ?? ''), p_primary_color: String(formData.get('primary_color') ?? '#E9FF70'), p_secondary_color: String(formData.get('secondary_color') ?? '#0B0C0F')
  });
  if (error) redirect('/leagues/new?error=' + encodeURIComponent(error.message));
  redirect(`/leagues/${(data as { league_id: string }).league_id}`);
}

export async function createLeagueInvite(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const leagueId = String(formData.get('league_id') ?? '');
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const { data, error } = await supabase.rpc('create_league_invite', { p_league_id: leagueId, p_email: email });
  if (error) redirect(`/leagues/${leagueId}?invite_error=` + encodeURIComponent(error.message));
  const invite = data as { invite_id: string; invite_token: string; email: string };
  const [{ data: league }, { data: profile }, { data: inviteRecord }, { count: claimedCount }] = await Promise.all([
    supabase.from('fantasy_leagues').select('name').eq('id', leagueId).maybeSingle(),
    supabase.from('user_profiles').select('display_name').eq('user_id', user.id).maybeSingle(),
    supabase.from('league_invites').select('expires_at').eq('id', invite.invite_id).maybeSingle(),
    supabase.from('league_members').select('id', { count:'exact', head:true }).eq('league_id', leagueId)
  ]);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://fantasysports-tawny.vercel.app';
  const message = leagueInviteEmail({ leagueName: league?.name ?? 'your fantasy league', commissionerName: profile?.display_name ?? 'Your commissioner', seasonLabel: '2026', claimedCount: claimedCount ?? 1, claimUrl: `${appUrl}/invite/${invite.invite_token}`, expiresLabel: inviteRecord?.expires_at ? new Date(inviteRecord.expires_at).toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric', timeZone:'UTC' }) : 'in 14 days' });
  const delivery = await sendTransactionalEmail({ to:email, subject:message.subject, html:message.html, idempotencyKey:`league-invite/${invite.invite_id}` });
  revalidatePath(`/leagues/${leagueId}`);
  redirect(`/leagues/${leagueId}?invite_created=1&invite_token=${invite.invite_token}&invite_email=${encodeURIComponent(email)}&email_status=${delivery.sent ? 'sent' : 'manual'}`);
}

export async function acceptLeagueInvite(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const token = String(formData.get('invite_token') ?? '');
  if (!user) redirect(`/login?message=${encodeURIComponent('Sign in or create an account to claim your league invite.')}&next=${encodeURIComponent(`/invite/${token}`)}`);
  const { data, error } = await supabase.rpc('accept_league_invite', { p_invite_token: token, p_franchise_name: String(formData.get('franchise_name') ?? ''), p_abbreviation: String(formData.get('abbreviation') ?? ''), p_primary_color: String(formData.get('primary_color') ?? '#E9FF70'), p_secondary_color: String(formData.get('secondary_color') ?? '#0B0C0F') });
  if (error) redirect(`/invite/${token}?error=` + encodeURIComponent(error.message));
  redirect(`/leagues/${(data as { league_id: string }).league_id}?joined=1`);
}

export async function generateCircuitSchedule(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const leagueId = String(formData.get('league_id') ?? '');
  const { data, error } = await supabase.rpc('generate_circuit_schedule', { p_league_id: leagueId });
  if (error) redirect(`/leagues/${leagueId}?schedule_error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/leagues/${leagueId}`);
  redirect(`/leagues/${leagueId}?schedule_status=${encodeURIComponent((data as {status:string}).status)}`);
}

export async function generateSpecialWeek(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const leagueId = String(formData.get('league_id') ?? '');
  const eventType = String(formData.get('event_type') ?? '');
  const config: Record<string,{rpc:string;week:number}> = {
    rivalry: { rpc:'generate_rivalry_week', week:10 },
    revenge: { rpc:'generate_revenge_week', week:11 },
    position: { rpc:'generate_position_week', week:12 }
  };
  const selected = config[eventType];
  if (!selected) redirect(`/leagues/${leagueId}/schedule?error=${encodeURIComponent('Unknown event week')}`);
  const { error } = await supabase.rpc(selected.rpc, { p_league_id:leagueId, p_week:selected.week });
  if (error) redirect(`/leagues/${leagueId}/schedule?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/leagues/${leagueId}/schedule`);
  redirect(`/leagues/${leagueId}/schedule?generated=${eventType}`);
}
