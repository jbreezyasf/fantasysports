'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '../../lib/supabase/server';

export async function refreshMatchup(formData: FormData) {
  const supabase = await createClient();
  const matchupId = String(formData.get('matchup_id') ?? '');
  const { error } = await supabase.rpc('recompute_matchup', { p_matchup_id: matchupId, p_finalize: false });
  if (error) redirect(`/matchups/${matchupId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/matchups/${matchupId}`);
  redirect(`/matchups/${matchupId}`);
}

export async function finalizeMatchup(formData: FormData) {
  const supabase = await createClient();
  const matchupId = String(formData.get('matchup_id') ?? '');
  const { error } = await supabase.rpc('recompute_matchup', { p_matchup_id: matchupId, p_finalize: true });
  if (error) redirect(`/matchups/${matchupId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/matchups/${matchupId}`);
  redirect(`/matchups/${matchupId}?finalized=1`);
}

type Tone = 'respect'|'playful'|'petty'|'savage';
type Facts = {
  week:number;
  homeName:string;
  awayName:string;
  homePoints:number;
  awayPoints:number;
  winnerName:string;
  loserName:string;
  margin:number;
  requesterWon:boolean;
};

function fallbackOptions(tone:Tone,f:Facts):string[] {
  const score=`${f.winnerName} ${Math.max(f.homePoints,f.awayPoints).toFixed(2)} – ${Math.min(f.homePoints,f.awayPoints).toFixed(2)} ${f.loserName}`;
  if(tone==='respect') return f.requesterWon
    ? [`GG, ${f.loserName}. ${score}. That was a real one.`,`Respect to ${f.loserName}. Week ${f.week} made us earn every point.`,`Good battle. ${f.margin.toFixed(2)} points decided it. See you next time.`]
    : [`GG, ${f.winnerName}. You earned Week ${f.week}.`,`Respect. ${score}. We’ll see you again.`,`That one belongs to ${f.winnerName}. No excuses — good game.`];
  if(tone==='playful') return f.requesterWon
    ? [`Scoreboard submitted the paperwork: ${score}.`,`Week ${f.week} meeting adjourned. Margin: ${f.margin.toFixed(2)}.`,`The front office reviewed the numbers. We’ll be keeping this win.`]
    : [`The scoreboard has been placed under appeal. Results: ${score}.`,`Fine. ${f.winnerName} gets this meeting. Next agenda item: revenge.`,`Week ${f.week} has been deleted from my calendar. See you next time.`];
  if(tone==='petty') return f.requesterWon
    ? [`You had all week and still finished ${f.margin.toFixed(2)} points short. That’s tough.`,`I brought a lineup. ${f.loserName} brought a learning experience.`,`The final score is public record. I won’t embarrass you by repeating it twice.`]
    : [`Enjoy the screenshot, ${f.winnerName}. It has an expiration date.`,`One win and suddenly everybody has Wi-Fi. I’ll remember this.`,`Congratulations on surviving Week ${f.week}. The rematch file is already open.`];
  return f.requesterWon
    ? [`That wasn’t a matchup. That was a quarterly performance review. ${score}.`,`I asked for competition and got a case study. ${f.margin.toFixed(2)}-point margin.`,`The scoreboard closed the argument before the Locker Room could start one.`]
    : [`Frame the score, ${f.winnerName}. You’re going to need the memory later.`,`You got Week ${f.week}. I’m keeping the receipts and the schedule.`,`Enjoy the victory lap. The franchise remembers everything.`];
}

function extractResponseText(payload:unknown):string|null {
  if(!payload || typeof payload!=='object') return null;
  const p=payload as {output_text?:unknown;output?:unknown};
  if(typeof p.output_text==='string') return p.output_text;
  if(Array.isArray(p.output)) {
    for(const item of p.output as Array<{content?:unknown}>){
      if(!Array.isArray(item?.content)) continue;
      for(const part of item.content as Array<{text?:unknown}>){ if(typeof part?.text==='string') return part.text; }
    }
  }
  return null;
}

async function aiOptions(tone:Tone,f:Facts):Promise<{options:string[];provider:string}> {
  const key=process.env.OPENAI_API_KEY?.trim();
  if(!key) return {options:fallbackOptions(tone,f),provider:'template'};
  const immutableFacts={week:f.week,home_team:f.homeName,away_team:f.awayName,home_points:f.homePoints,away_points:f.awayPoints,winner:f.winnerName,loser:f.loserName,margin:f.margin,requester_won:f.requesterWon};
  try {
    const res=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model:'gpt-5.6-luna',
        input:[{
          role:'user',
          content:`You write short fantasy-sports Locker Room lines for Big Exec Fantasy Sports.\nTone: ${tone}.\nImmutable facts: ${JSON.stringify(immutableFacts)}\nReturn ONLY a JSON array of exactly 3 strings. Each must be under 180 characters. Never invent scores, records, streaks, rivalry history, injuries, player facts, or private trade information. Do not use slurs, threats, protected-class insults, sexual humiliation, or harassment. Petty and savage should feel funny and competitive, not hateful. Respect/playful can be warmer.`
        }],
        max_output_tokens:300
      }),
      cache:'no-store'
    });
    if(!res.ok) throw new Error(`OpenAI ${res.status}`);
    const text=extractResponseText(await res.json());
    if(!text) throw new Error('No generated text');
    const parsed=JSON.parse(text) as unknown;
    if(!Array.isArray(parsed)) throw new Error('Unexpected generated format');
    const options=parsed.filter((x):x is string=>typeof x==='string').map(x=>x.trim()).filter(Boolean).slice(0,3);
    if(options.length!==3 || options.some(x=>x.length>180)) throw new Error('Invalid generated options');
    return {options,provider:'openai:gpt-5.6-luna'};
  } catch {
    return {options:fallbackOptions(tone,f),provider:'template'};
  }
}

export async function generatePostgameTalk(formData:FormData) {
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect('/login');
  const matchupId=String(formData.get('matchup_id')??'');
  const tone=String(formData.get('tone')??'playful').toLowerCase() as Tone;
  if(!['respect','playful','petty','savage'].includes(tone)) redirect(`/matchups/${matchupId}?error=${encodeURIComponent('Choose a valid tone')}`);
  const {data:matchup,error}=await supabase.from('matchups').select('id,league_season_id,week,home_season_franchise_id,away_season_franchise_id,home_points,away_points,winner_season_franchise_id,is_final').eq('id',matchupId).maybeSingle();
  if(error||!matchup||!matchup.is_final||!matchup.winner_season_franchise_id) redirect(`/matchups/${matchupId}?error=${encodeURIComponent('Postgame talk unlocks after a final matchup')}`);
  const [{data:sfs},{data:owners}]=await Promise.all([
    supabase.from('season_franchises').select('id,franchise_id,franchises(name)').in('id',[matchup.home_season_franchise_id,matchup.away_season_franchise_id]),
    supabase.from('franchise_owners').select('franchise_id,user_id').eq('user_id',user.id).is('ends_on',null)
  ]);
  const nameFor=(id:string)=>{const sf=sfs?.find(x=>x.id===id);const rel=sf?.franchises;const f=Array.isArray(rel)?rel[0]:rel as {name?:string}|null|undefined;return f?.name??'Franchise';};
  const ownedIds=new Set((owners??[]).map(o=>o.franchise_id));
  const requesterSf=sfs?.find(sf=>ownedIds.has(sf.franchise_id));
  if(!requesterSf) redirect(`/matchups/${matchupId}?error=${encodeURIComponent('Only a manager in this matchup can generate postgame talk')}`);
  const homeName=nameFor(matchup.home_season_franchise_id),awayName=nameFor(matchup.away_season_franchise_id);
  const winnerName=nameFor(matchup.winner_season_franchise_id);
  const loserId=matchup.winner_season_franchise_id===matchup.home_season_franchise_id?matchup.away_season_franchise_id:matchup.home_season_franchise_id;
  const facts:Facts={week:matchup.week,homeName,awayName,homePoints:Number(matchup.home_points),awayPoints:Number(matchup.away_points),winnerName,loserName:nameFor(loserId),margin:Math.abs(Number(matchup.home_points)-Number(matchup.away_points)),requesterWon:requesterSf.id===matchup.winner_season_franchise_id};
  const generated=await aiOptions(tone,facts);
  for(const body of generated.options){
    const {error:recordError}=await supabase.rpc('record_generated_message',{p_matchup_id:matchupId,p_tone:tone,p_body:body,p_provider:generated.provider});
    if(recordError) redirect(`/matchups/${matchupId}?error=${encodeURIComponent(recordError.message)}`);
  }
  revalidatePath(`/matchups/${matchupId}`);
  redirect(`/matchups/${matchupId}?talk=${tone}`);
}

export async function postGeneratedTalk(formData:FormData) {
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect('/login');
  const matchupId=String(formData.get('matchup_id')??'');
  const messageId=String(formData.get('message_id')??'');
  const body=String(formData.get('body')??'').trim();
  const {data,error}=await supabase.rpc('post_generated_message',{p_message_id:messageId,p_body:body||null});
  if(error) redirect(`/matchups/${matchupId}?error=${encodeURIComponent(error.message)}`);
  const leagueId=(data as {league_id?:string}|null)?.league_id;
  if(!leagueId) redirect(`/matchups/${matchupId}?error=${encodeURIComponent('Could not post to Locker Room')}`);
  revalidatePath(`/leagues/${leagueId}/locker-room`);
  redirect(`/leagues/${leagueId}/locker-room`);
}
