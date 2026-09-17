'use client';

import { useActionState } from 'react';
import { setLineup, type LineupActionState } from '../../../team/actions';

const initialLineupActionState: LineupActionState = {
  status: 'idle',
  message: '',
};

type Props = {
  seasonFranchiseId: string;
  franchiseId: string;
  week: number;
  slot: string;
  slotIndex: number;
  slotLabel: string;
  assetLabel: string;
  athleteId?: string | null;
  realTeamId?: string | null;
  buttonLabel: string;
};

export function LineupMoveForm(props: Props) {
  const [state, action, pending] = useActionState(setLineup, initialLineupActionState);

  return (
    <form action={action} className="lineupMoveForm">
      <input type="hidden" name="season_franchise_id" value={props.seasonFranchiseId} />
      <input type="hidden" name="franchise_id" value={props.franchiseId} />
      <input type="hidden" name="week" value={props.week} />
      <input type="hidden" name="slot" value={props.slot} />
      <input type="hidden" name="slot_index" value={props.slotIndex} />
      <input type="hidden" name="slot_label" value={props.slotLabel} />
      <input type="hidden" name="asset_label" value={props.assetLabel} />
      {props.athleteId && <input type="hidden" name="athlete_id" value={props.athleteId} />}
      {props.realTeamId && <input type="hidden" name="real_team_id" value={props.realTeamId} />}
      <button className="miniAction" type="submit" disabled={pending} aria-label={pending ? `Saving ${props.assetLabel} to ${props.slotLabel}` : props.buttonLabel}>
        {pending ? 'SAVING…' : props.assetLabel}
      </button>
      {state.message && (
        <span className="lineupMoveStatus" aria-live="polite" role={state.status === 'error' ? 'alert' : 'status'}>
          {state.message}
        </span>
      )}
    </form>
  );
}
