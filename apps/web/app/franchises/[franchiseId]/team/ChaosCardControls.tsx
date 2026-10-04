'use client';

import React, { useActionState, useEffect, useId, useRef } from 'react';
import { setChaosCardSelection, type ChaosCardActionState } from '../../../team/chaosCardActions';
import { ChaosCardFace, ChaosDeadlineTime } from '../../../components/ChaosCardFace';
import { useLocale } from '../../../components/LocaleProvider';
import { announceToScreenReader } from '../../../components/ScreenReaderAnnouncer';
import { CHAOS_CARD_STRINGS, CHAOS_SELECTION_TEXT, selectionKind, type ChaosAsset, type ChaosCardText, type ChaosSelectionView } from '../../../../lib/matchups/chaosCards';

const initialState: ChaosCardActionState = { status: 'idle', message: '', assetLabel: '' };

type Props = {
  card: ChaosCardText;
  matchupId: string;
  seasonFranchiseId: string;
  franchiseId: string;
  /** Null for cards that take no selection (Upset Bounty and the scoring twists). */
  view: ChaosSelectionView | null;
  /** Players on this roster that the opponent raided (RAID, higher seed). */
  raided: ChaosAsset[];
};

const assetValue = (asset: ChaosAsset) => (asset.athleteId ? `athlete:${asset.athleteId}` : `team:${asset.realTeamId}`);

/**
 * Selection controls for the card dealt to this franchise's Chaos Week game.
 * A plain form: radio buttons and a submit button, so it works with a keyboard,
 * a switch, a screen reader and touch, and never needs dragging.
 */
export function ChaosCardControls({ card, matchupId, seasonFranchiseId, franchiseId, view, raided }: Props) {
  const [state, action, pending] = useActionState(setChaosCardSelection, initialState);
  const { t } = useLocale();
  const id = useId();
  const kind = selectionKind(card.kind);
  const text = kind ? CHAOS_SELECTION_TEXT[kind] : null;
  const announced = useRef(state);

  // Announce each result once through the shared live region.
  useEffect(() => {
    if (announced.current === state || state.status === 'idle' || !text) return;
    announced.current = state;
    if (state.status === 'error') announceToScreenReader({ key: 'chaos-card-error', priority: 'assertive', message: state.message });
    else announceToScreenReader({ key: 'chaos-card-saved', priority: 'polite', message: `${t(state.status === 'cleared' ? text.cleared : text.saved)} ${state.assetLabel}`.trim() });
  }, [state, t, text]);

  return (
    <section className="panel chaosCardPanel chaosCardControls" aria-labelledby={`${id}-heading`}>
      <ChaosCardFace card={card} headingId={`${id}-heading`}>
        <a className="secondary chaosCardAction" href={`/matchups/${matchupId}`}>
          {CHAOS_CARD_STRINGS.viewMatchup}
        </a>
      </ChaosCardFace>

      <div className="chaosCardBody">
        <h3>{CHAOS_CARD_STRINGS.controlsHeading}</h3>
        {!view || !text ? (
          <p className="chaosSelectionNote">{CHAOS_CARD_STRINGS.noSelectionNeeded}</p>
        ) : (
          <>
            {view.status !== 'not_eligible' && (
              <p className="chaosSelectionCurrent">
                <span>{text.current}</span>
                {view.current ? <strong data-no-translate>{view.current.label}</strong> : <strong>{CHAOS_CARD_STRINGS.notMade}</strong>}
                <span className={`statusBadge ${view.status === 'open' ? 'is-available' : view.status === 'locked' ? 'is-locked' : 'is-final'}`}>{view.statusLabel}</span>
              </p>
            )}
            {view.status !== 'not_eligible' && !view.current && <p className="chaosSelectionNote">{text.none}</p>}
            {view.message && <p className="chaosSelectionNote">{view.message}</p>}

            {view.status === 'open' && (
              <form action={action} className="chaosSelectionForm">
                <input type="hidden" name="matchup_id" value={matchupId} />
                <input type="hidden" name="season_franchise_id" value={seasonFranchiseId} />
                <input type="hidden" name="franchise_id" value={franchiseId} />
                <input type="hidden" name="card_code" value={card.code} />
                <input type="hidden" name="asset_label" value={view.current?.label ?? ''} />
                {view.candidates.map((asset) => (
                  <input type="hidden" key={asset.key} name={`label:${assetValue(asset)}`} value={asset.label} />
                ))}
                <fieldset aria-describedby={`${id}-deadline`}>
                  <legend>{text.legend}</legend>
                  <p className="chaosSelectionNote" id={`${id}-deadline`}>
                    <span className="chaosDeadlineLabel">{CHAOS_CARD_STRINGS.deadline}</span> <span>{text.deadline}</span>
                    {view.deadlineAt && (
                      <>
                        {' '}
                        <ChaosDeadlineTime iso={view.deadlineAt} />
                      </>
                    )}
                  </p>
                  {view.candidates.length ? (
                    <div className="chaosChoiceList">
                      {view.candidates.map((asset, index) => (
                        <label className="chaosChoice" key={asset.key}>
                          <input type="radio" name="asset" value={assetValue(asset)} required defaultChecked={index === 0 && view.candidates.length === 1} />
                          <span data-no-translate>{asset.label}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="chaosSelectionNote">{CHAOS_CARD_STRINGS.noCandidates}</p>
                  )}
                </fieldset>
                <div className="actions">
                  {!!view.candidates.length && (
                    <button className="primary" type="submit" name="intent" value="set" disabled={pending}>
                      {pending ? CHAOS_CARD_STRINGS.saving : text.submit}
                    </button>
                  )}
                  {view.canClear && (
                    <button className="secondary" type="submit" name="intent" value="clear" formNoValidate disabled={pending}>
                      {CHAOS_CARD_STRINGS.clear}
                    </button>
                  )}
                </div>
              </form>
            )}

            {state.status === 'error' && (
              <p className="errorNotice" role="alert" data-no-translate>
                {state.message}
              </p>
            )}
            {(state.status === 'success' || state.status === 'cleared') && (
              <p className="successNotice" role="status">
                <span>{state.status === 'cleared' ? text.cleared : text.saved}</span> <span data-no-translate>{state.assetLabel}</span>
              </p>
            )}
          </>
        )}

        {!!raided.length && (
          <div className="chaosRaidedNotice" role="note">
            <p>{CHAOS_CARD_STRINGS.raidedNotice}</p>
            <ul>
              {raided.map((asset) => (
                <li key={asset.key} data-no-translate>
                  {asset.label}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
