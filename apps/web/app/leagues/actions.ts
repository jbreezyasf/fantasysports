'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '../../lib/supabase/server';
import { sendTransactionalEmail } from '../../lib/email/resend';
import { leagueInviteEmail } from '../../lib/email/templates';
import { invalidInviteEmails, parseInviteEmails } from './[leagueId]/invitationAccessibility';

export async function createLeague(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data, error } = await supabase.rpc('create_pro_football_league', {
    p_name: String(formData.get('league_name') ?? ''), p_franchise_name: String(formData.get('franchise_name') ?? ''), p_abbreviation: String(formData.get('abbreviation') ?? ''), p_primary_color: String(formData.get('primary_color') ?? '#D9B43B'), p_secondary_color: String(formData.get('secondary_color') ?? '#0B0B0C')
  });
  if (error) redirect('/leagues/new?error=' + encodeURIComponent(error.message));
  redirect(`/leagues/${(data as { league_id: string }).league_id}`);
}

export async function createLeagueInvite(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const leagueId = String(formData.get('league_id') ?? '');
  const emails = parseInviteEmails(String(formData.get('emails') ?? formData.get('email') ?? ''));
  const invalid = invalidInviteEmails(emails);
  if (!emails.length) redirect(`/leagues/${leagueId}?invite_error=` + encodeURIComponent('Enter at least one manager email address.'));
  if (invalid.length) redirect(`/leagues/${leagueId}?invite_error=` + encodeURIComponent(`Correct invalid email address: ${invalid.join(', ')}`));
  const [{ data: league }, { data: profile }, { count: claimedCount }] = await Promise.all([
    supabase.from('fantasy_leagues').select('name,max_franchises').eq('id', leagueId).maybeSingle(),
    supabase.from('user_profiles').select('display_name').eq('user_id', user.id).maybeSingle(),
    supabase.from('league_members').select('id', { count:'exact', head:true }).eq('league_id', leagueId)
  ]);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bigexecfs.com';
  let firstToken=''; let sent=0; let manual=0;
  for (const email of emails) {
    const { data, error } = await supabase.rpc('create_league_invite', { p_league_id: leagueId, p_email: email });
    if (error) redirect(`/leagues/${leagueId}?invite_error=` + encodeURIComponent(error.message));
    const invite = data as { invite_id: string; invite_token: string; email: string };
    if (!firstToken) firstToken=invite.invite_token;
    const { data: inviteRecord } = await supabase.from('league_invites').select('expires_at').eq('id', invite.invite_id).maybeSingle();
    const message = leagueInviteEmail({ leagueName: league?.name ?? 'your fantasy league', commissionerName: profile?.display_name ?? 'Your commissioner', seasonLabel: '2026', claimedCount: claimedCount ?? 1, totalSpots: league?.max_franchises ?? 10, claimUrl: `${appUrl}/invite/${invite.invite_token}`, expiresLabel: inviteRecord?.expires_at ? new Date(inviteRecord.expires_at).toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric', timeZone:'UTC' }) : 'in 14 days' });
    const resendBucket = Math.floor(Date.now() / 60000);
    const delivery = await sendTransactionalEmail({ to:email, subject:message.subject, html:message.html, text:message.text, idempotencyKey:`league-invite/${invite.invite_id}/${resendBucket}` });
    if (delivery.sent) sent += 1; else manual += 1;
  }
  revalidatePath(`/leagues/${leagueId}`);
  const emailStatus = sent && manual ? 'mixed' : sent ? 'sent' : 'manual';
  redirect(`/leagues/${leagueId}?invite_created=1&invite_token=${firstToken}&invite_email=${encodeURIComponent(emails.join(', '))}&invite_count=${emails.length}&email_status=${emailStatus}`);
}

export async function resendLeagueInvite(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const leagueId = String(formData.get('league_id') ?? '');
  const inviteId = String(formData.get('invite_id') ?? '');
  const { data: invite, error: inviteError } = await supabase.from('league_invites').select('id,email,invite_token,status,expires_at').eq('id', inviteId).eq('league_id', leagueId).maybeSingle();
  if (inviteError || !invite) redirect(`/leagues/${leagueId}?invite_error=` + encodeURIComponent(inviteError?.message ?? 'Invite not found.'));
  if (invite.status !== 'pending') redirect(`/leagues/${leagueId}?invite_error=` + encodeURIComponent(`Only pending invitations can be resent. ${invite.email} is ${invite.status}.`));
  const [{ data: league }, { data: profile }, { count: claimedCount }] = await Promise.all([
    supabase.from('fantasy_leagues').select('name,max_franchises').eq('id', leagueId).maybeSingle(),
    supabase.from('user_profiles').select('display_name').eq('user_id', user.id).maybeSingle(),
    supabase.from('league_members').select('id', { count:'exact', head:true }).eq('league_id', leagueId)
  ]);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bigexecfs.com';
  const message = leagueInviteEmail({ leagueName: league?.name ?? 'your fantasy league', commissionerName: profile?.display_name ?? 'Your commissioner', seasonLabel: '2026', claimedCount: claimedCount ?? 1, totalSpots: league?.max_franchises ?? 10, claimUrl: `${appUrl}/invite/${invite.invite_token}`, expiresLabel: invite.expires_at ? new Date(invite.expires_at).toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric', timeZone:'UTC' }) : 'in 14 days' });
  const resendBucket = Math.floor(Date.now() / 60000);
  const delivery = await sendTransactionalEmail({ to:invite.email, subject:message.subject, html:message.html, text:message.text, idempotencyKey:`league-invite/resend/${invite.id}/${resendBucket}` });
  revalidatePath(`/leagues/${leagueId}`);
  redirect(`/leagues/${leagueId}?invite_resent=1&invite_email=${encodeURIComponent(invite.email)}&email_status=${delivery.sent ? 'sent' : 'manual'}`);
}

export async function acceptLeagueInvite(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const token = String(formData.get('invite_token') ?? '');
  if (!user) redirect(`/login?message=${encodeURIComponent('Sign in or create an account to claim your league invite.')}&next=${encodeURIComponent(`/invite/${token}`)}`);
  const { data, error } = await supabase.rpc('accept_league_invite', { p_invite_token: token, p_franchise_name: String(formData.get('franchise_name') ?? ''), p_abbreviation: String(formData.get('abbreviation') ?? ''), p_primary_color: String(formData.get('primary_color') ?? '#D9B43B'), p_secondary_color: String(formData.get('secondary_color') ?? '#0B0B0C') });
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
  revalidatePath(`/leagues/${leagueId}/schedule`);
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
    position: { rpc:'generate_position_week', week:12 },
    chaos: { rpc:'generate_chaos_week', week:13 },
    judgment: { rpc:'generate_judgment_week', week:14 }
  };
  const selected = config[eventType];
  if (!selected) redirect(`/leagues/${leagueId}/schedule?error=${encodeURIComponent('Unknown event week')}`);
  const { error } = await supabase.rpc(selected.rpc, { p_league_id:leagueId, p_week:selected.week });
  if (error) redirect(`/leagues/${leagueId}/schedule?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/leagues/${leagueId}/schedule`);
  revalidatePath(`/leagues/${leagueId}`);
  redirect(`/leagues/${leagueId}/schedule?generated=${eventType}`);
}

export async function advancePostseason(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const leagueId = String(formData.get('league_id') ?? '');
  const phase = String(formData.get('phase') ?? '');
  const rpcByPhase: Record<string,string> = {
    seed: 'initialize_postseason',
    week16: 'generate_postseason_week16',
    week17: 'generate_postseason_week17',
    close: 'close_league_season'
  };
  const rpc = rpcByPhase[phase];
  if (!rpc) redirect(`/leagues/${leagueId}/schedule?error=${encodeURIComponent('Unknown postseason phase')}`);
  const { error } = await supabase.rpc(rpc, { p_league_id: leagueId });
  if (error) redirect(`/leagues/${leagueId}/schedule?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/leagues/${leagueId}/schedule`);
  revalidatePath(`/leagues/${leagueId}`);
  redirect(`/leagues/${leagueId}/schedule?generated=${encodeURIComponent(phase)}`);
}
