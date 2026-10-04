import React from 'react';
import { CHAOS_CARD_STRINGS, type ChaosAutoCaptain, type ChaosCardKind, type ChaosCardText } from '../../lib/matchups/chaosCards';

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
  return (
    <div className="chaosAutoCaptain" id={id} data-auto-captain={auto.locked ? 'locked' : 'pending'}>
      <p className="chaosSelectionNote">
        <span>{auto.locked ? CHAOS_CARD_STRINGS.autoCaptainLocked : own ? CHAOS_CARD_STRINGS.autoCaptainIfNone : CHAOS_CARD_STRINGS.autoCaptainIfNoneOther}</span> <strong data-no-translate>{auto.asset.label}</strong>
        {auto.locked && (
          <>
            {' '}
            <span>{CHAOS_CARD_STRINGS.autoCaptainLockedSuffix}</span>
          </>
        )}
      </p>
      <p className="chaosSelectionNote">
        <span>{auto.expected === null ? CHAOS_CARD_STRINGS.autoCaptainNoHistory : CHAOS_CARD_STRINGS.autoCaptainReason}</span>
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

const DEADLINE_FORMAT: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short' };

/** A kickoff or deadline, always shown in US Eastern time with the zone named. */
export function ChaosDeadlineTime({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} data-no-translate>
      {new Date(iso).toLocaleString('en-US', DEADLINE_FORMAT)}
    </time>
  );
}
