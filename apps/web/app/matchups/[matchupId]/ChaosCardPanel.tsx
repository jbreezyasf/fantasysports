import React from 'react';
import { ChaosAutoPickNote, ChaosCardFace, ChaosDeadlineTime, ChaosPenaltyNote, ChaosVoidNote } from '../../components/ChaosCardFace';
import { CHAOS_CARD_STRINGS, CHAOS_SELECTION_TEXT, selectionKind, signedPoints, type ChaosCardText, type ChaosScoreBuild, type ChaosSelectionView, type ChaosSideBuild } from '../../../lib/matchups/chaosCards';

export type ChaosPanelSide = {
  seasonFranchiseId: string;
  name: string;
  isLowerSeed: boolean;
  /** Present for CAPTAIN / WILD SLOT / RAID. */
  selection: ChaosSelectionView | null;
};

type Props = {
  card: ChaosCardText;
  home: ChaosPanelSide;
  away: ChaosPanelSide;
  build: ChaosScoreBuild | null;
  /** Display names for the assets named in adjustment lines, by athlete or team id. */
  assetNames: Record<string, string>;
  isFinal: boolean;
  /** Link to the signed-in manager's lineup page, when they play in this game and can still choose. */
  lineupHref: string | null;
};

function statusClass(status: ChaosSelectionView['status']) {
  return status === 'open' ? 'is-available' : status === 'locked' ? 'is-locked' : 'is-final';
}

function SelectionSummary({ side, kind }: { side: ChaosPanelSide; kind: 'captain' | 'wild_slot' | 'raid' }) {
  const view = side.selection;
  const text = CHAOS_SELECTION_TEXT[kind];
  return (
    <li className="chaosSelectionSide">
      <p className="chaosSelectionTeam">
        <strong data-no-translate>{side.name}</strong>
        <span>{side.isLowerSeed ? CHAOS_CARD_STRINGS.lowerSeed : CHAOS_CARD_STRINGS.higherSeed}</span>
      </p>
      {view && view.status !== 'not_eligible' ? (
        <>
          <p className="chaosSelectionCurrent">
            <span>{text.current}</span>
            {view.current ? <strong data-no-translate>{view.current.label}</strong> : <strong>{CHAOS_CARD_STRINGS.notMade}</strong>}
            <span className={`statusBadge ${statusClass(view.status)}`}>{view.statusLabel}</span>
          </p>
          {!view.current && <p className="chaosSelectionNote">{text.none}</p>}
          {view.voided && kind !== 'captain' && <ChaosVoidNote kind={kind} asset={view.voided} chooseAgain={false} />}
          {view.message && <p className="chaosSelectionNote">{view.message}</p>}
          {view.autoPick && <ChaosAutoPickNote kind={kind} auto={view.autoPick} own={false} />}
          {kind === 'wild_slot' && !view.current && !view.autoPick && view.status === 'open' && <p className="chaosSelectionNote">{CHAOS_CARD_STRINGS.autoWildNone}</p>}
          {view.penalty && <ChaosPenaltyNote />}
          {view.status === 'open' && (
            <p className="chaosSelectionNote">
              <span className="chaosDeadlineLabel">{CHAOS_CARD_STRINGS.deadline}</span> <span>{text.deadline}</span>
              {view.deadlineAt && (
                <>
                  {' '}
                  <ChaosDeadlineTime iso={view.deadlineAt} />
                </>
              )}
            </p>
          )}
        </>
      ) : (
        <p className="chaosSelectionNote">{view?.message ?? CHAOS_CARD_STRINGS.noSelectionNeeded}</p>
      )}
    </li>
  );
}

function BuildTable({ name, side, assetNames }: { name: string; side: ChaosSideBuild; assetNames: Record<string, string> }) {
  return (
    <table className="chaosBuildTable">
      <caption data-no-translate>{name}</caption>
      <tbody>
        <tr>
          <th scope="row">{CHAOS_CARD_STRINGS.base}</th>
          <td data-no-translate>{side.base.toFixed(2)}</td>
        </tr>
        {side.lines.map((line, index) => (
          <tr className="chaosBuildLine" key={`${line.effect}-${line.athleteId ?? line.realTeamId ?? index}`}>
            <th scope="row">
              <span>{line.label}</span>
              <small data-no-translate>{assetNames[line.athleteId ?? line.realTeamId ?? ''] ?? ''}</small>
            </th>
            <td data-no-translate>{signedPoints(line.points)}</td>
          </tr>
        ))}
        {!side.lines.length && (
          <tr className="chaosBuildLine">
            <th scope="row">{CHAOS_CARD_STRINGS.noAdjustments}</th>
            <td data-no-translate>{signedPoints(0)}</td>
          </tr>
        )}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">{CHAOS_CARD_STRINGS.total}</th>
          <td data-no-translate>{side.total.toFixed(2)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

/** The dealt card on the Chaos Week matchup page. Rendered only when chaosCardSurface() returns a card. */
export function ChaosCardPanel({ card, home, away, build, assetNames, isFinal, lineupHref }: Props) {
  const kind = selectionKind(card.kind);
  const bountyHolder = build?.bounty ? [home, away].find((side) => side.seasonFranchiseId === build.bounty?.seasonFranchiseId) : null;
  return (
    <section className="panel chaosCardPanel" aria-labelledby="chaos-card-heading">
      <ChaosCardFace card={card} headingId="chaos-card-heading">
        {lineupHref && (
          <a className="primary chaosCardAction" href={lineupHref}>
            {CHAOS_CARD_STRINGS.goToLineup}
          </a>
        )}
      </ChaosCardFace>

      <div className="chaosCardBody">
        <h3 id="chaos-selections-heading">{CHAOS_CARD_STRINGS.selections}</h3>
        {kind ? (
          <ul className="chaosSelectionList" aria-labelledby="chaos-selections-heading">
            <SelectionSummary side={home} kind={kind} />
            <SelectionSummary side={away} kind={kind} />
          </ul>
        ) : card.kind === 'bounty' ? (
          <p className="chaosSelectionNote" role="note">
            {bountyHolder && build?.bounty ? (
              <>
                <strong data-no-translate>{bountyHolder.name}</strong> <span>{build.bounty.grant === 'up_three' ? CHAOS_CARD_STRINGS.bountyEarnedUp : CHAOS_CARD_STRINGS.bountyEarnedFirst}</span>{' '}
                {build.bounty.effectiveUntil && <ChaosDeadlineTime iso={build.bounty.effectiveUntil} />}
              </>
            ) : isFinal ? (
              <span>{CHAOS_CARD_STRINGS.bountyNotEarned}</span>
            ) : (
              <>
                <span>{CHAOS_CARD_STRINGS.bountyPending}</span> <span>{CHAOS_CARD_STRINGS.lowerSeed}</span> <strong data-no-translate>{(home.isLowerSeed ? home : away).name}</strong>
              </>
            )}
          </p>
        ) : (
          <p className="chaosSelectionNote">{CHAOS_CARD_STRINGS.noSelectionNeeded}</p>
        )}

        {build && (
          <>
            <h3 id="chaos-build-heading">{CHAOS_CARD_STRINGS.scoreHeading}</h3>
            <div className="chaosBuildGrid" role="group" aria-labelledby="chaos-build-heading">
              <BuildTable name={home.name} side={build.home} assetNames={assetNames} />
              <BuildTable name={away.name} side={build.away} assetNames={assetNames} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
