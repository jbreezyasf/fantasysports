// @ts-expect-error The operational stress-season module is native ESM.
import { runWeeklyQaParticipation } from '../../../../../../scripts/stress-season/weekly-participation.mjs';
import { authorizeCron, cronError } from '../_shared';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;

export async function GET(request:Request){
  if(!authorizeCron(request))return new Response('Unauthorized',{status:401});
  try{return Response.json({ok:true,job:'qa-weekly-participation',result:await runWeeklyQaParticipation()});}
  catch(error){return cronError('qa-weekly-participation',error);}
}
