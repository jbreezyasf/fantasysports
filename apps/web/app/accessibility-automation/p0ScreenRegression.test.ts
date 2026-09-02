import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

function expectSource(relativePath: string, snippets: string[]) {
  const contents = source(relativePath);

  for (const snippet of snippets) {
    expect(contents, `${relativePath} should contain ${snippet}`).toContain(snippet);
  }
}

describe('P0 accessibility screen regressions', () => {
  it('keeps roster and lineup labels, states, and transaction confirmation content', () => {
    expectSource('app/franchises/[franchiseId]/team/page.tsx', [
      'aria-labelledby="starters-heading"',
      'describeLineupSlot(label,currentLabel)',
      'aria-label={`Move eligible players to ${label}`}',
      'slot_label',
      'asset_label',
      'lineupMoveButtonLabel(assetLabel,label,week)',
      'lineupMoveConfirmation(query.lineup_asset',
      'role="status"',
      'aria-labelledby="bench-heading"',
      "describeAssetForScreenReader(asset,'bench')"
    ]);
  });

  it('keeps player search labels, filter states, result announcements, and inspect controls', () => {
    expectSource('app/leagues/[leagueId]/players/page.tsx', [
      'htmlFor="player-search"',
      'availableOnlyToggle',
      'playerSearchSummary(resultCount,active,availableOnly,sortOrder)',
      "aria-current={active===pos?'true':undefined}",
      'describePlayerSearchResult',
      'View player details for',
      'StatusBadge state="rostered"'
    ]);
  });

  it('keeps waiver review and withdrawal semantics on the canonical waiver route', () => {
    expectSource('app/leagues/[leagueId]/players/page.tsx', [
      'waiverReviewAnnouncement',
      'role="group"',
      'role="status"',
      'Submit Reviewed Claim',
      'Review Waiver Claim',
      'Withdraw waiver claim for',
      'FAAB amount',
      'Priority'
    ]);
  });

  it('keeps draft state, clock, queue, and confirmed-pick accessibility semantics', () => {
    expectSource('app/drafts/[draftId]/page.tsx', [
      'draftStateAnnouncement',
      'onClockAnnouncement',
      'role="status"',
      'announcementPrefix',
      'announceThresholds',
      'Draft pick confirmed',
      'aria-labelledby="recent-picks-heading"'
    ]);
    expectSource('app/drafts/[draftId]/DraftClock.tsx', [
      'announceToScreenReader',
      'thresholds',
      'aria-label={`${totalSeconds} seconds remaining`}'
    ]);
    expectSource('app/drafts/[draftId]/DraftPlayerPool.tsx', [
      'aria-pressed={position===value}',
      'draftCandidateLabel',
      'Review draft pick for',
      'Confirm Draft Pick',
      'asset_label',
      'Remove ${asset.displayName} from queue'
    ]);
  });

  it('keeps matchup live-score announcements and scoring-row labels', () => {
    expectSource('app/matchups/[matchupId]/page.tsx', [
      'MatchupScoreAnnouncer',
      'aria-label={summary}',
      'role="status"',
      'score_status',
      'matchupRowLabel',
      'Refresh Scores'
    ]);
    expectSource('app/matchups/[matchupId]/MatchupScoreAnnouncer.tsx', [
      'announceToScreenReader',
      'matchup-score-${matchupId}'
    ]);
  });

  it('keeps standings table roles, headers, and postseason seed labels', () => {
    expectSource('app/leagues/[leagueId]/page.tsx', [
      'role="table"',
      'role="columnheader"',
      'standingRowLabel',
      'aria-label="League standings"'
    ]);
    expectSource('app/leagues/[leagueId]/schedule/page.tsx', [
      'role="table"',
      'role="columnheader"',
      'standingRowLabel',
      'aria-label="Postseason seeds"',
      'Seed ${s.seed}. Team'
    ]);
  });
});
