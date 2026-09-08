# Assistant GM FAQ — Shared
**Status:** Research-backed candidate knowledge. Do not override canonical Big Exec rules or live league state.

## Basics

### FLOW-001 — What is Big Exec?

**Answer:** Big Exec is a fantasy sports game. You run your own team, make moves, play other managers, and build team history.

### FLOW-002 — What is fantasy sports?

**Answer:** You pick real players for a make-believe team. What they do in real games helps your fantasy team.

## Getting started

### FLOW-003 — What do I do after I join a league?

**Answer:** Make your team, get ready for the draft, draft players, and set your lineup. Then check your team each week.

## Navigation

### FLOW-004 — Where should I start?

**Answer:** Start in the Front Office. It shows your team and what needs your help next.

### FLOW-005 — What is the Front Office?

**Answer:** The Front Office is your home page. It shows your team, record, league news, and key things to do.

### FLOW-006 — What is the Draft Room?

**Answer:** The Draft Room is where you pick players for your team. It also shows the draft order, clock, and players left.

### FLOW-007 — What happens to the Draft Room after the draft?

**Answer:** After the draft, that main card becomes Free Agency. That is where you can find players who are still open.

### FLOW-008 — What is Free Agency?

**Answer:** Free Agency is where you look for players no team owns. Some can be added now, and some may be on waivers.

### FLOW-009 — What is the Locker Room?

**Answer:** The Locker Room is your league chat and news feed. You can talk, react, and see league events there.

### FLOW-010 — What is Matchup?

**Answer:** Matchup shows your game for the week. It shows the score, starters, and players who still have games left.

### FLOW-011 — What is the League page?

**Answer:** The League page shows things like standings, the schedule, playoffs, and league history.

### FLOW-012 — What is the Stadium?

**Answer:** The Stadium shows your team history and things you have won. It grows as your team builds a legacy.

### FLOW-013 — What is the Trade Room?

**Answer:** The Trade Room is where you send, see, and talk about trade offers with other teams.

### FLOW-014 — What is League News?

**Answer:** League News tells the story of your league. It can show big scores, trades, awards, and changes in the standings.

## League setup

### FLOW-015 — What is a commissioner?

**Answer:** The commissioner is the person who runs the league. They set key rules and help with league problems.

### FLOW-016 — How do I invite someone to my league?

**Answer:** Use the league invite tool and enter their email. I can help you read it back before you send it.

**Answer type:** Dynamic — check live state before answering.

**Internal tool note:** getLeagueInvitations / invite preparation

### FLOW-017 — How do I join a league invite?

**Answer:** Open the invite. Sign in or make an account. Then follow the steps to join.

## Franchise

### FLOW-018 — What is my franchise?

**Answer:** Your franchise is your Big Exec team. Its name, wins, awards, and history can stay with you over time.

### FLOW-019 — Do my real players stay forever?

**Answer:** Not always. Player rosters can change by season, but your franchise name and history can stay.

## Assistant GM

### FLOW-020 — What can the Assistant GM do?

**Answer:** The GM can teach the game and read your team info. It can also explain choices and help plan a move.

### FLOW-021 — Can the GM tell me what to do next?

**Answer:** Yes. It can look at the right team facts and point out the most important thing to check next.

**Answer type:** Dynamic — check live state before answering.

**Internal tool note:** league context + roster/lineup/matchup state

### FLOW-022 — Can the GM change my team by itself?

**Answer:** No. It can get a move ready, but you must say yes before a big team change is made.

### FLOW-023 — Why do I have to confirm a move?

**Answer:** A wrong move can hurt your team. We show the exact move first so you can check it before it is sent.

### FLOW-024 — Can I talk to the GM?

**Answer:** Yes. You can use voice when it is on for your device and the app has mic access.

### FLOW-025 — Can I type to the GM instead?

**Answer:** Yes. You can type your question if you do not want to use voice.

## Accessibility

### FLOW-026 — Can the GM read the screen to me?

**Answer:** Yes. The GM can read key game facts aloud and show the same words on the screen.

### FLOW-027 — Can the GM help if I have low or no vision?

**Answer:** Yes. Core game help, voice help, screen reader support, and clear text are part of access to the game.

### FLOW-028 — How will the GM read an email address back to me?

**Answer:** It should read the address, then spell it in a clear way. You can fix any part before the invite is sent.

## Rules

### FLOW-029 — What if I ask about a rule in my league?

**Answer:** I will check your league rule first. I should not guess when your league can have its own setting.

**Answer type:** Dynamic — check live state before answering.

**Internal tool note:** getLeagueContext / current league settings

### FLOW-030 — What if I ask about my score, roster, trade, or waiver?

**Answer:** I will check the live league facts first. Those answers can change, so I should not use an old answer.

**Answer type:** Dynamic — check live state before answering.

**Internal tool note:** authoritative current state

## Season

### FLOW-031 — What happens when the season ends?

**Answer:** Final results go into league history. Your team can keep its wins, awards, and title history for the future.
