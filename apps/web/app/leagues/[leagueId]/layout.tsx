import BigExecMobileNav from '../../components/BigExecMobileNav';

export default async function LeagueLayout({children,params}:{children:React.ReactNode;params:Promise<{leagueId:string}>}) {
  const {leagueId}=await params;
  return <>
    <nav className="leagueNav" aria-label="League navigation">
      <a href={`/leagues/${leagueId}`}>HQ</a>
      <a href={`/leagues/${leagueId}/locker-room`}>Locker Room</a>
      <a href={`/leagues/${leagueId}/schedule`}>Schedule</a>
      <a href={`/leagues/${leagueId}/trades`}>Trades</a>
    </nav>
    {children}
    <BigExecMobileNav leagueId={leagueId}/>
  </>;
}
