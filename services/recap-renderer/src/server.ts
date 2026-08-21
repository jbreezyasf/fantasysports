import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const OUTPUT_ROOT = process.env.RECAP_OUTPUT_ROOT || '/var/lib/bigexec-recaps';
const PORT = Number(process.env.PORT || process.env.RECAP_HTTP_PORT || 8787);

function contentType(path:string){
  return extname(path)==='.mp4' ? 'video/mp4' : 'application/octet-stream';
}

export function startRenderServer(){
  const server=createServer(async(req,res)=>{
    if(req.url==='/health'){
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
      return res.end(JSON.stringify({ok:true,service:'big-exec-recap-renderer'}));
    }
    if(!req.url?.startsWith('/renders/')){res.writeHead(404);return res.end('Not found');}
    const relative=decodeURIComponent(req.url.slice('/renders/'.length));
    const safe=normalize(relative).replace(/^(\.\.(\/|\\|$))+/, '');
    const file=join(OUTPUT_ROOT,safe);
    try{
      const info=await stat(file);
      if(!info.isFile()) throw new Error('not file');
      res.writeHead(200,{
        'content-type':contentType(file),
        'content-length':String(info.size),
        'accept-ranges':'bytes',
        'cache-control':'public, max-age=31536000, immutable',
        'access-control-allow-origin':'*'
      });
      createReadStream(file).pipe(res);
    }catch{res.writeHead(404);res.end('Not found');}
  });
  server.listen(PORT,'0.0.0.0',()=>console.log(`[recap] media server listening on :${PORT}`));
  return server;
}
