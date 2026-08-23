import BigExecMobileNav from '../../components/BigExecMobileNav';
import BigExecAppHeader from '../../components/BigExecAppHeader';

export default async function LeagueLayout({children,params}:{children:React.ReactNode;params:Promise<{leagueId:string}>}) {
  const {leagueId}=await params;
  return <>
    <BigExecAppHeader leagueId={leagueId}/>
    {children}
    <BigExecMobileNav leagueId={leagueId}/>
  </>;
}
