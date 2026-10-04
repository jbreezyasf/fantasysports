import React from 'react';
import { CHAOS_CARD_STRINGS, type ChaosCardKind, type ChaosCardText } from '../../lib/matchups/chaosCards';

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

const DEADLINE_FORMAT: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short' };

/** A kickoff or deadline, always shown in US Eastern time with the zone named. */
export function ChaosDeadlineTime({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} data-no-translate>
      {new Date(iso).toLocaleString('en-US', DEADLINE_FORMAT)}
    </time>
  );
}
