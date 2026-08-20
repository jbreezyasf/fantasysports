export type AuthoritativeGameFacts = {
  eventType: string;
  week: number;
  homeFranchise: string;
  awayFranchise: string;
  homePoints: number;
  awayPoints: number;
  winner?: string;
  topPerformers?: Array<{ name: string; points: number }>;
};

export function buildNarrationContext(facts: AuthoritativeGameFacts) {
  return {
    instruction: 'Narrate only the supplied authoritative facts. Do not invent scores, winners, injuries, transactions, or player statistics.',
    facts
  };
}
