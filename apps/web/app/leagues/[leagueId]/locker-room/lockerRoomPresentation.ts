type FeedEvent = { event_type: string; body: string | null; payload: unknown };
type FeedLookups = {
  athletes: Map<string, string>;
  teams: Map<string, string>;
  franchises: Map<string, string>;
};

const objectPayload = (payload: unknown): Record<string, unknown> =>
  payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
const stringValue = (value: unknown) =>
  typeof value === "string" ? value : null;
const numberValue = (value: unknown) =>
  typeof value === "number" ? value : null;

export function presentLockerEvent(event: FeedEvent, lookups: FeedLookups) {
  const payload = objectPayload(event.payload);
  const franchiseId =
    stringValue(payload.season_franchise_id) ??
    stringValue(payload.winner_season_franchise_id);
  const athleteId = stringValue(payload.athlete_id);
  const teamId = stringValue(payload.real_team_id);
  const franchise = franchiseId ? lookups.franchises.get(franchiseId) : null;
  const asset =
    (athleteId ? lookups.athletes.get(athleteId) : null) ??
    (teamId ? lookups.teams.get(teamId) : null);
  const pick = numberValue(payload.pick_number);
  if (
    event.event_type === "draft_pick" ||
    event.event_type === "draft_auto_pick"
  ) {
    const manager = franchise ?? "A franchise";
    const selection = asset ?? "a player";
    return event.event_type === "draft_auto_pick"
      ? `${manager} landed ${selection}${pick ? ` at pick ${pick}` : ""} when the clock ran out.`
      : `${manager} selected ${selection}${pick ? ` with pick ${pick}` : ""}.`;
  }
  if (event.event_type === "waiver_claimed")
    return `${franchise ?? "A franchise"} won the waiver claim for ${asset ?? "a new player"}.`;
  return event.body?.trim() || "League update";
}

export function isConversationEvent(event: FeedEvent) {
  return event.event_type === "locker_room_message";
}
