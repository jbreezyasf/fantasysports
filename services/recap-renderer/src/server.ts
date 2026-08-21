import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const OUTPUT_ROOT = resolve(process.env.RECAP_OUTPUT_ROOT || '/var/lib/bigexec-recaps');
const PORT = Number(process.env.PORT || process.env.RECAP_HTTP_PORT || 8787);

function contentType(path:string){return extname(path)==='.mp4'?'video/mp4':'application/octet-stream';}
function mediaHeaders(type:string){return {'content-type':type,'accept-ranges':'bytes','cache-control':'public, max-age=31536000, immutable','access-control-allow-origin':'*'};}

export function startRenderServer(){
  const server=createServer(async(req,res)=>{
    if(req.url==='/health'){
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
      return res.end(JSON.stringify({ok:true,service:'big-exec-recap-renderer'}));
    }
    if(!req.url?.startsWith('/renders/')){res.writeHead(404);return res.end('Not found');}
    const relative=decodeURIComponent(req.url.slice('/renders/'.length));
    const safe=normalize(relative).replace(/^(\.\.(\/|\\|$))+/, '');
    const file=resolve(OUTPUT_ROOT,safe);
    if(file!==OUTPUT_ROOT&&!file.startsWith(`${OUTPUT_ROOT}/`)){res.writeHead(403);return res.end('Forbidden');}
    try{
      const info=await stat(file); if(!info.isFile())throw new Error('not file');
      const type=contentType(file); const range=req.headers.range;
      if(range){
        const match=/^bytes=(\d*)-(\d*)$/.exec(range.trim());
        if(!match){res.writeHead(416,{'content-range':`bytes */${info.size}`});return res.end();}
        let start=match[1]?Number(match[1]):0; let end=match[2]?Number(match[2]):info.size-1;
        if(!match[1]&&match[2]){const suffix=Number(match[2]);start=Math.max(0,info.size-suffix);end=info.size-1;}
        if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<start||start>=info.size){res.writeHead(416,{'content-range':`bytes */${info.size}`});return res.end();}
        end=Math.min(end,info.size-1); const length=end-start+1;
        res.writeHead(206,{...mediaHeaders(type),'content-length':String(length),'content-range':`bytes ${start}-${end}/${info.size}`});
        return createReadStream(file,{start,end}).pipe(res);
      }
      res.writeHead(200,{...mediaHeaders(type),'content-length':String(info.size)});
      createReadStream(file).pipe(res);
    }catch{res.writeHead(404);res.end('Not found');}
  });
  server.listen(PORT,'0.0.0.0',()=>console.log(`[recap] media server listening on :${PORT}`));
  return server;
}
