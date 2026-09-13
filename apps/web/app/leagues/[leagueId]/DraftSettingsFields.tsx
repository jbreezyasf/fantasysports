'use client';

import { useState } from 'react';

const clockOptions = [30, 45, 60, 90, 120] as const;

function durationLabel(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.ceil((totalSeconds % 3600) / 60);
  if (!hours) return `${minutes} minutes`;
  return `${hours} hour${hours === 1 ? '' : 's'}${minutes ? ` ${minutes} minutes` : ''}`;
}

export default function DraftSettingsFields({ franchiseCount, rounds = 15 }: { franchiseCount: number; rounds?: number }) {
  const [pickSeconds, setPickSeconds] = useState(60);
  const totalPicks = franchiseCount * rounds;

  return <>
    <label>Draft date &amp; time<input name="starts_at" type="datetime-local" /></label>
    <label>Time per pick
      <select name="pick_seconds" value={pickSeconds} onChange={event => setPickSeconds(Number(event.target.value))}>
        {clockOptions.map(seconds => <option key={seconds} value={seconds}>{seconds} seconds{seconds === 60 ? ' — Recommended' : ''}</option>)}
      </select>
    </label>
    <p className="formHint" aria-live="polite">{totalPicks} picks at {pickSeconds} seconds each: up to {durationLabel(totalPicks * pickSeconds)} if every clock expires.</p>
  </>;
}
