export default async function LeagueLayout({children,params}:{children:React.ReactNode;params:Promise<{leagueId:string}>}) {
  const {leagueId}=await params;
  const navStyle:React.CSSProperties={position:'sticky',top:0,zIndex:40,display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'1px',width:'min(1180px,100%)',margin:'0 auto',padding:'8px 18px',background:'rgba(8,8,8,.94)',backdropFilter:'blur(16px)',borderBottom:'1px solid #302d27'};
  const linkStyle:React.CSSProperties={display:'flex',alignItems:'center',justifyContent:'center',minHeight:'44px',padding:'8px 6px',border:'1px solid #302d27',background:'#111113',fontSize:'.68rem',fontWeight:900,letterSpacing:'.06em',textTransform:'uppercase',textAlign:'center'};
  return <>
    <nav style={navStyle} aria-label="League navigation">
      <a style={linkStyle} href={`/leagues/${leagueId}`}>HQ</a>
      <a style={linkStyle} href={`/leagues/${leagueId}/locker-room`}>Locker Room</a>
      <a style={linkStyle} href={`/leagues/${leagueId}/schedule`}>Schedule</a>
      <a style={linkStyle} href={`/leagues/${leagueId}/trades`}>Trades</a>
    </nav>
    {children}
  </>;
}
