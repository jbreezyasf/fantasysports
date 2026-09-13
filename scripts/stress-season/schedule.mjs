function hash(input) {
  let value = 2166136261;
  for (const char of input) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

export function participationFor({ testId, actorLabel, overallPick }) {
  const roll = hash(`${testId}:${actorLabel}:${overallPick}`) % 100;
  if (roll < 18) return { mode: 'autopick', delaySeconds: null };
  if (roll < 42) return { mode: 'late-manual', delaySeconds: 18 + (roll % 20) };
  return { mode: 'manual', delaySeconds: 3 + (roll % 12) };
}

export function weeklyCheckWindows(label, week) {
  const offset = hash(`${label}:${week}`) % 45;
  return [
    { purpose: 'waivers', weekday: 'Tuesday', localTime: `20:${String(offset).padStart(2, '0')}` },
    { purpose: 'lineup', weekday: 'Sunday', localTime: `10:${String(offset).padStart(2, '0')}` },
  ];
}
