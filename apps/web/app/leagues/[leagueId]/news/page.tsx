import { notFound, redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";

type Franchise = { name: string };
function relation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function LeagueNewsPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: member }, { data: league }, { data: season }] =
    await Promise.all([
      supabase
        .from("league_members")
        .select("id")
        .eq("league_id", leagueId)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("fantasy_leagues")
        .select("name")
        .eq("id", leagueId)
        .maybeSingle(),
      supabase
        .from("league_seasons")
        .select("id")
        .eq("league_id", leagueId)
        .eq("is_current", true)
        .maybeSingle(),
    ]);
  if (!member || !league || !season) notFound();
  const [
    { data: stories },
    { data: standings },
    { data: awards },
    { data: trades },
  ] = await Promise.all([
    supabase
      .from("league_feed_events")
      .select("id,event_type,body,created_at")
      .eq("league_id", leagueId)
      .order("created_at", { ascending: false })
      .limit(80),
    supabase
      .from("standings")
      .select(
        "rank,wins,losses,ties,points_for,season_franchises(franchises(name))",
      )
      .eq("league_season_id", season.id)
      .order("rank", { ascending: true })
      .limit(5),
    supabase
      .from("weekly_awards")
      .select("id,week,code,title,created_at")
      .eq("league_season_id", season.id)
      .order("week", { ascending: false })
      .limit(6),
    supabase
      .from("trades")
      .select("id,status,created_at")
      .eq("league_season_id", season.id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  const top = stories?.[0];
  return (
    <main className="leagueNewsPage">
      <section className="leagueNewsHero">
        <p className="eyebrow">{league.name.toUpperCase()} • NEWSROOM</p>
        <h1>The league never sleeps.</h1>
        <p>
          Results, roster moves, rivalries, awards, and the decisions shaping
          this season.
        </p>
        {top && (
          <article>
            <span>TOP STORY</span>
            <h2>{top.body}</h2>
            <time dateTime={top.created_at}>
              {new Date(top.created_at).toLocaleString()}
            </time>
          </article>
        )}
      </section>
      <section className="leagueNewsGrid">
        <div className="leagueNewsStream">
          <div className="sectionTitleRow">
            <div>
              <p className="eyebrow">LATEST WIRE</p>
              <h2>Around the league</h2>
            </div>
          </div>
          {(stories ?? []).slice(top ? 1 : 0).map((story) => (
            <article className="leagueNewsItem" key={story.id}>
              <span>{story.event_type.replaceAll("_", " ")}</span>
              <p>{story.body}</p>
              <time dateTime={story.created_at}>
                {new Date(story.created_at).toLocaleString()}
              </time>
            </article>
          ))}
          {!stories?.length && (
            <p className="emptyNotice">
              No headlines yet. Draft picks, transactions, results, and awards
              will build this wire.
            </p>
          )}
        </div>
        <aside className="leagueNewsRail">
          <section>
            <p className="eyebrow">LEAGUE TABLE</p>
            <h2>Top five</h2>
            {(standings ?? []).map((row, index) => {
              const sf = relation(
                row.season_franchises as
                  | { franchises: Franchise | Franchise[] }
                  | Array<{ franchises: Franchise | Franchise[] }>
                  | null,
              );
              const franchise = relation(sf?.franchises);
              return (
                <div
                  className="newsStanding"
                  key={`${index}-${franchise?.name}`}
                >
                  <b>{row.rank ?? index + 1}</b>
                  <span>{franchise?.name ?? "Franchise"}</span>
                  <small>
                    {row.wins}-{row.losses}
                    {row.ties ? `-${row.ties}` : ""}
                  </small>
                  <small>{Number(row.points_for).toFixed(2)} PF</small>
                </div>
              );
            })}
          </section>
          <section>
            <p className="eyebrow">HONORS</p>
            <h2>Weekly awards</h2>
            {(awards ?? []).map((award) => (
              <article className="newsBrief" key={award.id}>
                <span>
                  WEEK {award.week} • {award.code.replaceAll("_", " ")}
                </span>
                <p>{award.title}</p>
              </article>
            ))}
            {!awards?.length && <p>No awards have been posted yet.</p>}
          </section>
          <section>
            <p className="eyebrow">DEAL DESK</p>
            <h2>Trade pulse</h2>
            <p>
              {trades?.length ?? 0} recent trade record
              {trades?.length === 1 ? "" : "s"}.
            </p>
            <a className="secondary" href={`/leagues/${leagueId}/trades`}>
              Open Trade Room
            </a>
          </section>
        </aside>
      </section>
    </main>
  );
}
