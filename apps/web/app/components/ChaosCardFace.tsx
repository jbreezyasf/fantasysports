import React from 'react';
import { CHAOS_CARD_STRINGS, type ChaosAutoCaptain, type ChaosAutoPick, type ChaosCardKind, type ChaosCardText } from '../../lib/matchups/chaosCards';

// Original Big Exec glyphs, drawn inline. Decorative: the card's name and rules carry the meaning.
function Emblem({ kind }: { kind: ChaosCardKind }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <svg className="chaosCardEmblem" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true" focusable="false">
      <rect x="3" y="3" width="42" height="42" rx="9" {...common} strokeWidth={1.5} opacity={0.55} />
      {kind === 'captain' && (
        <>
          <path d="M12 18l12-7 12 7" {...common} />
          <path d="M12 26l12-7 12 7" {...common} />
          <path d="M18 36h12" {...common} />
        </>
      )}
      {kind === 'wild_slot' && (
        <>
          <rect x="13" y="13" width="22" height="22" rx="4" {...common} strokeDasharray="4 4" />
          <path d="M24 18v12M18 24h12" {...common} />
        </>
      )}
      {kind === 'raid' && (
        <>
          <path d="M24 9v30" {...common} strokeDasharray="3 4" opacity={0.7} />
          <path d="M36 24H14" {...common} />
          <path d="M21 17l-7 7 7 7" {...common} />
        </>
      )}
      {kind === 'bounty' && (
        <>
          <path d="M24 36V13" {...common} />
          <path d="M16 21l8-8 8 8" {...common} />
          <path d="M13 36h22" {...common} />
        </>
      )}
      {kind === 'twist' && (
        <>
          <path d="M14 20a11 11 0 0 1 19-4" {...common} />
          <path d="M34 10v7h-7" {...common} />
          <path d="M34 28a11 11 0 0 1-19 4" {...common} />
          <path d="M14 38v-7h7" {...common} />
        </>
      )}
    </svg>
  );
}

/** The dealt card: name, rules text and how it was dealt. Server-renderable, no state. */
export function ChaosCardFace({ card, headingId, headingLevel = 2, children }: { card: ChaosCardText; headingId: string; headingLevel?: 2 | 3; children?: React.ReactNode }) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <div className="chaosCardFace" data-card-kind={card.kind}>
      <Emblem kind={card.kind} />
      <div className="chaosCardFaceText">
        <p className="eyebrow">{CHAOS_CARD_STRINGS.eyebrow}</p>
        <Heading id={headingId}>{card.name}</Heading>
        <p className="chaosCardRules">{card.rules}</p>
        <p className="chaosCardDealt">{CHAOS_CARD_STRINGS.dealtNote}</p>
        {children}
      </div>
    </div>
  );
}

/**
 * Who the captain is when none is named, and why. `own` is the signed-in
 * manager's own franchise (the lineup page); the matchup page shows both sides.
 * Before that player's kickoff it is a preview; from the kickoff it is locked for the week.
 * The name and the numbers stay outside the translatable sentences.
 */
export function ChaosAutoCaptainNote({ auto, own, id }: { auto: ChaosAutoCaptain; own: boolean; id?: string }) {
  return <ChaosAutoPickNote kind="captain" auto={auto} own={own} id={id} />;
}

// The sentences of the automatic-selection note, per card. Each is a static string with a Spanish catalog entry.
const AUTO_PICK_TEXT = {
  captain: { locked: CHAOS_CARD_STRINGS.autoCaptainLocked, own: CHAOS_CARD_STRINGS.autoCaptainIfNone, other: CHAOS_CARD_STRINGS.autoCaptainIfNoneOther, suffix: CHAOS_CARD_STRINGS.autoCaptainLockedSuffix, reason: CHAOS_CARD_STRINGS.autoCaptainReason, noHistory: CHAOS_CARD_STRINGS.autoCaptainNoHistory },
  wild_slot: { locked: CHAOS_CARD_STRINGS.autoWildLocked, own: CHAOS_CARD_STRINGS.autoPickIfNone, other: CHAOS_CARD_STRINGS.autoWildIfNoneOther, suffix: CHAOS_CARD_STRINGS.autoCaptainLockedSuffix, reason: CHAOS_CARD_STRINGS.autoWildReason, noHistory: CHAOS_CARD_STRINGS.autoWildNoHistory },
  raid: { locked: CHAOS_CARD_STRINGS.autoRaidLocked, own: CHAOS_CARD_STRINGS.autoPickIfNone, other: CHAOS_CARD_STRINGS.autoRaidIfNoneOther, suffix: CHAOS_CARD_STRINGS.autoRaidLockedSuffix, reason: CHAOS_CARD_STRINGS.autoRaidReason, noHistory: CHAOS_CARD_STRINGS.autoRaidNoHistory },
} as const;

/**
 * The selection the system makes when the manager makes none (captain, Wild
 * Slot player or raid), and why: "If you do not choose, the system will pick
 * ..." before it is due, "Automatic ...: ..." once it is fixed. The database
 * chose it (chaos_auto_pick); this only shows it. The name and the numbers stay
 * outside the translatable sentences.
 */
export function ChaosAutoPickNote({ kind, auto, own, id }: { kind: 'captain' | 'wild_slot' | 'raid'; auto: ChaosAutoPick; own: boolean; id?: string }) {
  const text = AUTO_PICK_TEXT[kind];
  const reason = auto.penalty ? (auto.expected === null ? CHAOS_CARD_STRINGS.autoPenaltyNoHistory : CHAOS_CARD_STRINGS.autoPenaltyReason) : auto.expected === null ? text.noHistory : text.reason;
  return (
    <div className="chaosAutoCaptain" id={id} data-auto-captain={auto.locked ? 'locked' : 'pending'} {...(kind === 'captain' ? {} : { 'data-auto-pick': kind })}>
      <p className="chaosSelectionNote">
        <span>{auto.locked ? text.locked : own ? text.own : text.other}</span> <strong data-no-translate>{auto.asset.label}</strong>
        {auto.locked && (
          <>
            {' '}
            <span>{text.suffix}</span>
          </>
        )}
      </p>
      <p className="chaosSelectionNote">
        <span>{reason}</span>
        {auto.expected !== null && (
          <>
            {' '}
            <span>{CHAOS_CARD_STRINGS.autoCaptainAverage}</span> <strong data-no-translate>{auto.expected.toFixed(2)}</strong>
            {' · '}
            <span>{CHAOS_CARD_STRINGS.autoCaptainGames}</span> <strong data-no-translate>{auto.games}</strong>
          </>
        )}
      </p>
    </div>
  );
}

/** A Wild Slot pick or a raid that no longer counts because its player left the roster before kickoff. `own`: the manager can still choose again. */
export function ChaosVoidNote({ kind, asset, chooseAgain }: { kind: 'wild_slot' | 'raid'; asset: { label: string }; chooseAgain: boolean }) {
  return (
    <p className="chaosSelectionNote chaosVoidNote" role="note" data-chaos-void={kind}>
      <strong data-no-translate>{asset.label}</strong> <span className="statusBadge is-final">{CHAOS_CARD_STRINGS.voidLabel}</span> <span>{kind === 'raid' ? CHAOS_CARD_STRINGS.voidRaid : CHAOS_CARD_STRINGS.voidWild}</span>
      {chooseAgain && (
        <>
          {' '}
          <span>{kind === 'raid' ? CHAOS_CARD_STRINGS.voidRaidChoose : CHAOS_CARD_STRINGS.voidWildChoose}</span>
        </>
      )}
    </p>
  );
}

/** The raid penalty, in words: why a starter is being raided and what it does to each side. */
export function ChaosPenaltyNote() {
  return (
    <p className="chaosSelectionNote chaosPenaltyNote" role="note" data-chaos-penalty="true">
      {CHAOS_CARD_STRINGS.raidPenalty}
    </p>
  );
}

const DEADLINE_FORMAT: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short' };

/** A kickoff or deadline, always shown in US Eastern time with the zone named. */
export function ChaosDeadlineTime({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} data-no-translate>
      {new Date(iso).toLocaleString('en-US', DEADLINE_FORMAT)}
    </time>
  );
}
