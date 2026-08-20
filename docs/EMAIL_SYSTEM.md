# Transactional Email System

Working brand placeholder: **Fantasy All-Sports**. Replace once the permanent product name/domain is selected.

## Delivery architecture

- Supabase Auth remains the identity/authentication source of truth.
- Resend will deliver transactional email once the final domain is verified.
- Authentication/security mail should use a dedicated subdomain, e.g. `auth.example.com`.
- Product/league notifications should use a separate sending subdomain, e.g. `updates.example.com`.
- Marketing mail, if added later, should use a third reputation stream.
- SPF, DKIM and DMARC must be configured before production sending.
- Security emails stay visually restrained and deliverability-first; league emails may carry richer franchise styling.

## Sender plan

- `Front Office <no-reply@auth.example.com>` — signup confirmation, password reset, magic/security links.
- `League Office <league@updates.example.com>` — invitations, draft notices, league events, matchup/final notices.
- `Commissioner Desk <commissioner@updates.example.com>` — optional commissioner-originated system messages later.

---

## 1. Confirm your account

**Subject:** Your Front Office is almost ready

**Preheader:** Confirm your email to enter your franchise.

**Body:**

Your Front Office is almost ready.

Confirm this email address to activate your manager account and enter the league.

**CTA:** CONFIRM MY ACCOUNT

If you did not create this account, you can safely ignore this message.

---

## 2. Welcome / account confirmed

**Subject:** Welcome to the Front Office

**Preheader:** Your manager account is active.

**Body:**

You're in.

Your manager account is active. From here you can create a league, accept an invitation, build a franchise and start creating the history that follows you season after season.

**Primary CTA:** ENTER THE FRONT OFFICE

**Secondary copy:** Your record starts when your franchise does.

---

## 3. Password reset

**Subject:** Reset your Front Office password

**Preheader:** Use this secure link to get back into your account.

**Body:**

A password reset was requested for your manager account.

Use the secure link below to choose a new password.

**CTA:** RESET PASSWORD

This link expires for your protection. If you did not request a reset, no action is required.

---

## 4. League invitation — primary growth email

**Subject:** You've been invited to {{league_name}}

**Preheader:** {{commissioner_name}} saved you a franchise spot.

**Body:**

### YOU'VE BEEN DRAFTED INTO THE LEAGUE.

{{commissioner_name}} invited you to join **{{league_name}}** for the {{season_label}} season.

Your spot is waiting. Claim it, name your franchise, choose your colors and start building a history that can follow you across seasons.

**CTA:** CLAIM MY FRANCHISE

**League details:**
- Pro Football
- Half-PPR
- {{claimed_count}} / 10 franchise spots claimed
- Draft: {{draft_date_or_tbd}}

This invitation expires {{invite_expiration}}.

---

## 5. League invitation reminder

**Subject:** Your franchise spot in {{league_name}} is still open

**Preheader:** The league is filling up.

**Body:**

Your invitation to **{{league_name}}** is still active.

There are **{{open_slots}} franchise spots remaining**. Claim yours before the invitation expires.

**CTA:** CLAIM MY FRANCHISE

If you're sitting this season out, no problem — simply ignore this email.

---

## 6. Franchise claimed

**Subject:** {{franchise_name}} has entered the league

**Preheader:** Your franchise is official.

**Body:**

### FRANCHISE ESTABLISHED.

**{{franchise_name}}** is officially part of **{{league_name}}**.

**Est. {{year}}**

From this season forward, championships, rivalry history, records and stadium achievements can become part of your franchise legacy.

**CTA:** ENTER MY FRONT OFFICE

Next up: Draft Day.

---

## 7. New franchise joined — league-wide notice

**Subject:** A new franchise just entered {{league_name}}

**Preheader:** {{franchise_name}} has arrived.

**Body:**

The league just got one franchise deeper.

**{{franchise_name}}** has officially joined **{{league_name}}**.

The league now has **{{claimed_count}} / 10** franchise spots claimed.

**CTA:** VIEW THE LEAGUE

---

## 8. League almost full

**Subject:** One franchise spot remains in {{league_name}}

**Preheader:** Draft Day is getting close.

**Body:**

**{{league_name}}** is almost complete.

Nine franchises are in. One spot remains.

Once the final franchise is claimed, the league can lock its manager field and move toward Draft Day.

**CTA:** VIEW THE LEAGUE

---

## 9. League full

**Subject:** {{league_name}} is officially full

**Preheader:** All 10 franchises are in.

**Body:**

### THE FIELD IS SET.

All **10 franchises** have claimed their spots in **{{league_name}}**.

Next milestone: Draft Day.

**CTA:** MEET THE LEAGUE

---

## 10. Draft date announced

**Subject:** Draft Day is set for {{league_name}}

**Preheader:** Your franchise goes on the clock {{draft_datetime}}.

**Body:**

Draft Day is officially on the calendar.

**{{league_name}}** drafts on **{{draft_datetime}}**.

Before the room opens, check your franchise, review the player pool and make sure you're ready when the clock starts.

**CTA:** PREP FOR THE DRAFT

---

## 11. Draft reminder — 24 hours

**Subject:** Draft Day is tomorrow

**Preheader:** {{league_name}} goes on the clock in 24 hours.

**Body:**

Tomorrow, the franchises start taking shape.

Your **{{league_name}}** draft begins at **{{draft_datetime}}**.

**CTA:** OPEN MY DRAFT ROOM

---

## 12. Draft reminder — 1 hour

**Subject:** You're almost on the clock

**Preheader:** Draft room opens in one hour.

**Body:**

**{{league_name}}** Draft Day starts in one hour.

Get into the room, check your connection and get your board ready.

**CTA:** ENTER THE DRAFT ROOM

---

## 13. Draft complete

**Subject:** Your roster is built

**Preheader:** {{franchise_name}} is ready for Week 1.

**Body:**

Draft complete.

**{{franchise_name}}** has its first roster of the season.

Your next job as Franchise Manager: set the lineup and get ready for the opening matchup.

**CTA:** VIEW MY TEAM

---

## 14. Lineup warning

**Subject:** Your Front Office needs attention

**Preheader:** {{issue_count}} lineup item(s) need a decision before kickoff.

**Body:**

Your Week {{week}} lineup is not fully ready.

{{lineup_issue_summary}}

Fix it before the affected player's game locks.

**CTA:** FIX MY LINEUP

---

## 15. Rivalry Week announcement

**Subject:** Rivalry Week is here

**Preheader:** This one goes into the history books.

**Body:**

### RIVALRY WEEK.

This week's matchup carries more than a win or loss.

**{{franchise_name}} vs {{opponent_franchise}}**

Current rivalry record: **{{rivalry_record}}**

**CTA:** VIEW THE MATCHUP

---

## 16. Revenge Week announcement

**Subject:** Your revenge game is set

**Preheader:** You get another shot at {{opponent_franchise}}.

**Body:**

Earlier this season, **{{opponent_franchise}}** handed you a loss.

Now you get another shot.

**{{franchise_name}} vs {{opponent_franchise}}**

**CTA:** ENTER REVENGE WEEK

---

## 17. Weekly matchup final

**Subject:** FINAL: {{franchise_name}} {{your_score}} — {{opponent_score}} {{opponent_franchise}}

**Preheader:** The matchup is final. The recap is ready.

**Body:**

### {{result_label}}

**{{franchise_name}} {{your_score}}**  
**{{opponent_franchise}} {{opponent_score}}**

{{result_story_line}}

**Primary CTA:** WATCH THE RECAP

**Secondary CTA:** VIEW MATCHUP

Postgame options inside the app: Send Respect • Talk Your Smack

---

## 18. Playoff berth clinched

**Subject:** {{franchise_name}} is going to the postseason

**Preheader:** Your season continues.

**Body:**

### CLINCHED.

**{{franchise_name}}** has secured a postseason spot in **{{league_name}}**.

Your franchise history just added another line.

**CTA:** VIEW THE BRACKET

---

## 19. Championship matchup

**Subject:** One matchup for the championship

**Preheader:** {{franchise_name}} is playing for the title.

**Body:**

This is it.

**{{franchise_name}} vs {{opponent_franchise}}**

One matchup decides the {{season_label}} **{{league_name}} Champion**.

**CTA:** VIEW THE CHAMPIONSHIP

---

## 20. Champion crowned

**Subject:** {{franchise_name}} are the {{season_label}} champions

**Preheader:** The banner is earned.

**Body:**

### LEAGUE CHAMPIONS.

**{{franchise_name}}** has won **{{league_name}}**.

Final: **{{champion_score}} — {{runner_up_score}}**

The championship is permanently added to franchise history. When the league returns next season, this banner goes up before Draft Day.

**CTA:** WATCH THE CHAMPIONSHIP RECAP

---

## 21. Returning-season invitation

**Subject:** Run it back? {{league_name}} is returning

**Preheader:** Your franchise history is waiting for another season.

**Body:**

A new season is approaching, and **{{league_name}}** is reopening the Front Office.

Your existing franchise history remains intact:

- {{championship_count}} championships
- {{career_record}}
- {{rivalry_wins}} rivalry wins
- {{seasons_played}} seasons played

**CTA:** RETURN FOR {{new_season_label}}

---

## 22. Banner ceremony / new season opening

**Subject:** Before the draft, one banner goes up

**Preheader:** {{last_champion}} gets their moment before the new season begins.

**Body:**

Before a new champion can be crowned, the league honors the one who owns the throne.

Join **{{league_name}}** before Draft Day for the {{previous_season}} championship banner ceremony.

Then the new season begins.

**CTA:** ENTER THE CEREMONY

---

# Template rules

1. Never invent game facts in email. Scores, records, injuries and standings come from authoritative database state.
2. Keep auth emails lightweight and low-image for deliverability.
3. League/product emails may use one strong visual hero later, but must still work with images disabled.
4. Every important CTA must also appear as a plain URL fallback in the email footer.
5. All transactional mail must include a clear reason the recipient received it.
6. League invitations expire after 14 days by current backend rule.
7. No betting, odds, sportsbook or gambling language.
8. Avoid NFL/team-logo/player-photo assets unless future rights permit them.
9. User-facing emails should say **Pro Football**, not NFL.
10. Final brand substitution should be centralized so the working title can be replaced without editing 22 templates manually.
