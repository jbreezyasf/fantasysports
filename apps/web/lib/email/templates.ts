function esc(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[character] ?? character));
}

function shell(eyebrow: string, heading: string, body: string, ctaLabel: string, ctaUrl: string) {
  return `<!doctype html><html><body style="margin:0;background:#08090b;color:#f7f4ed;font-family:Arial,Helvetica,sans-serif"><div style="max-width:620px;margin:0 auto;padding:42px 24px"><div style="border-bottom:1px solid #2a2b30;padding-bottom:18px;margin-bottom:30px"><div style="font-size:28px;line-height:1;font-weight:900;letter-spacing:-1px;color:#ffffff">BIG EXEC</div><div style="font-size:10px;font-weight:800;letter-spacing:4px;color:#D4AF37;margin-top:5px">FANTASY SPORTS</div></div><div style="font-size:11px;font-weight:800;letter-spacing:2px;color:#D4AF37;margin-bottom:18px">${esc(eyebrow)}</div><h1 style="font-size:42px;line-height:.95;text-transform:uppercase;margin:0 0 22px">${esc(heading)}</h1><div style="font-size:16px;line-height:1.65;color:#c7c4bc">${body}</div><div style="margin:32px 0"><a href="${esc(ctaUrl)}" style="display:inline-block;background:#D4AF37;color:#08090b;text-decoration:none;padding:15px 19px;font-size:12px;font-weight:900;letter-spacing:1px">${esc(ctaLabel)}</a></div><div style="border-top:1px solid #2a2b30;padding-top:18px;color:#8d8a84;font-size:12px;line-height:1.5">Run the franchise. Own the season.<br><br>If the button does not work, copy this link into your browser:<br><span style="word-break:break-all">${esc(ctaUrl)}</span></div></div></body></html>`;
}

export function leagueInviteEmail(input: { leagueName:string; commissionerName:string; seasonLabel:string; claimedCount:number; claimUrl:string; expiresLabel:string; }) {
  const body = `<p style="margin:0 0 14px">${esc(input.commissionerName)} saved you a franchise spot in <strong style="color:#f7f4ed">${esc(input.leagueName)}</strong> on Big Exec Fantasy Sports.</p><p style="margin:0 0 14px">Claim it, name your franchise, choose your colors, and start building a record that can follow you season after season.</p><p style="margin:22px 0 0;color:#f7f4ed"><strong>Pro Football • Half-PPR</strong><br>${input.claimedCount}/10 franchise spots claimed<br>${esc(input.seasonLabel)} season</p><p style="margin:14px 0 0;font-size:13px">Invitation expires ${esc(input.expiresLabel)}.</p>`;
  return { subject:`Big Exec invite: ${input.leagueName}`, html:shell("YOU'VE BEEN DRAFTED INTO THE LEAGUE.",`Join ${input.leagueName}`,body,'CLAIM MY FRANCHISE',input.claimUrl) };
}

export function draftAnnouncementEmail(input:{leagueName:string;draftLabel:string;draftUrl:string}) {
  const body=`<p>Draft Day is officially on the calendar for <strong style="color:#f7f4ed">${esc(input.leagueName)}</strong>.</p><p style="color:#f7f4ed"><strong>${esc(input.draftLabel)}</strong></p><p>Check your franchise, review the player pool, and be ready when the clock starts.</p>`;
  return { subject:`Big Exec Draft Day: ${input.leagueName}`,html:shell('DRAFT DAY', 'The clock is coming.',body,'PREP FOR THE DRAFT',input.draftUrl) };
}

export function matchupFinalEmail(input:{franchiseName:string;opponentName:string;yourScore:string;opponentScore:string;resultLabel:string;storyLine:string;recapUrl:string}) {
  const body=`<p style="font-size:13px;letter-spacing:1px">${esc(input.resultLabel)}</p><p style="font-size:24px;color:#f7f4ed"><strong>${esc(input.franchiseName)} ${esc(input.yourScore)}</strong><br>${esc(input.opponentName)} ${esc(input.opponentScore)}</p><p>${esc(input.storyLine)}</p>`;
  return { subject:`Big Exec FINAL: ${input.franchiseName} ${input.yourScore} — ${input.opponentScore} ${input.opponentName}`,html:shell('MATCHUP FINAL','The result is in.',body,'WATCH THE RECAP',input.recapUrl) };
}
