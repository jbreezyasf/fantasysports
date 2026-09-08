# Assistant GM FAQ — Football
**Status:** Research-backed candidate knowledge. Do not override canonical Big Exec rules or live league state.

## Draft

### FB-030 — What is a fantasy draft?

**Answer:** The draft is when each team picks its players. Teams take turns making picks.

### FB-031 — What is a snake draft?

**Answer:** A snake draft flips the pick order each round. If you pick early in one round, you pick later in the next.

### FB-032 — What is draft order?

**Answer:** Draft order tells which manager picks first, second, and so on.

### FB-033 — What does on the clock mean?

**Answer:** On the clock means it is your turn to make a draft pick.

### FB-034 — How long do I have to make a pick?

**Answer:** Your league sets the draft clock. I can check the exact time for your draft.

**Answer type:** Dynamic — check live state before answering.

**Internal tool note:** getDraftState / league draft timer

### FB-035 — What is my draft queue?

**Answer:** Your queue is a private list of players you want. Put your top choice first.

### FB-036 — What happens if my draft clock runs out?

**Answer:** Big Exec checks your queue first. If it cannot use the queue, it can make a legal auto pick from its ranks.

### FB-037 — What is an auto pick?

**Answer:** An auto pick is a pick the game makes for you when needed. It must still follow the roster rules.

### FB-038 — What does available mean in the draft?

**Answer:** Available means no team in your league has picked that player yet.

### FB-039 — Can two teams draft the same player?

**Answer:** No. One player can belong to only one fantasy team in the same Big Exec league.

### FB-040 — What is a player rank?

**Answer:** A rank is an order that helps compare players. A lower number means the player is listed closer to the top.

### FB-041 — What is ADP?

**Answer:** ADP means average draft spot. It shows about where a player is being picked in many drafts.

### FB-042 — What is a reach?

**Answer:** A reach is taking a player much earlier than most people expect. It can still be your choice.

### FB-043 — What is a sleeper?

**Answer:** A sleeper may do far better than most people think.

### FB-044 — What is a handcuff?

**Answer:** A handcuff is a backup you keep. They may get a big role if the main player gets hurt.

### FB-045 — What is a position run?

**Answer:** A position run is a fast group of picks. Many people take the same player type.

### FB-046 — What does best available mean?

**Answer:** Best available means the top player left on a rank list. That player may not be the best fit for your team.

### FB-047 — Who should I draft?

**Answer:** I can help. I first need your team, the players left, your rules, and your next pick.

**Answer type:** Dynamic — check live state before answering.

**Internal tool note:** draft state + roster + available players + scoring

### FB-048 — What positions should I draft first?

**Answer:** There is no one right order. Build a strong group, fill every needed spot, and do not ignore good value.

### FB-049 — Should I draft only starters first?

**Answer:** Not always. A good bench can help with injuries and bye weeks. Your best pick depends on who is left.

### FB-050 — What if I lose my internet during the draft?

**Answer:** Come back to the Draft Room. Big Exec should restore the draft, your queue, and the current pick.

### FB-051 — Can the commissioner pause the draft?

**Answer:** Yes. Big Exec has a commissioner pause and resume tool for the draft.

### FB-052 — Can the commissioner undo a bad pick?

**Answer:** Big Exec can let the commissioner undo the last pick when a fix is needed. The change is saved in a log.

### FB-053 — When is the draft over?

**Answer:** The draft ends after every team has filled all draft spots.
