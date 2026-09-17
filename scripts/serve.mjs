import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../public/',import.meta.url)));
const args=process.argv.slice(2), port=Number(process.env.PORT||args[args.indexOf('--port')+1]||4173);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webmanifest':'application/manifest+json','.jpeg':'image/jpeg','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');const suffix=decodeURIComponent(url.pathname).replace(/^\/anya-math\//,'/');
    let file=path.resolve(root,'.'+suffix);
    if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    if((await stat(file)).isDirectory())file=path.join(file,'index.html');
    const data=await readFile(file);res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(data);
  }catch{res.writeHead(404,{'content-type':'text/plain'});res.end('Not found');}
});
server.listen(port,'0.0.0.0',()=>console.log(`Local: http://localhost:${server.address().port}/`));
