import { cp, mkdir, rm, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url)), src=path.join(root,'public'), out=path.join(root,'dist');
async function files(dir){return(await Promise.all((await readdir(dir)).map(async name=>{const p=path.join(dir,name);return(await stat(p)).isDirectory()?files(p):[p];}))).flat();}
for(const file of await files(src)){
  if(file.endsWith('.js'))execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
  if(file.endsWith('.html')||file.endsWith('.css')){
    const text=await readFile(file,'utf8');
    const refs=file.endsWith('.html')?[...text.matchAll(/(?:src|href)="(\.[^"]+)"/g)].map(m=>m[1]):[...text.matchAll(/url\(['"]?(\.\.[^'")]+)['"]?\)/g)].map(m=>m[1]);
    for(const ref of refs)await stat(path.resolve(path.dirname(file),ref));
  }
}
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});await cp(src,out,{recursive:true});await writeFile(path.join(out,'.nojekyll'),'');
console.log('Production build ready: dist/ (relative asset paths, no runtime dependencies)');
