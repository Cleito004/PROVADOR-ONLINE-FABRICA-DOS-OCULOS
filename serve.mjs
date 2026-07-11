import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const types = { '.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.glb':'model/gltf-binary','.json':'application/json' };
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = process.env.PORT || 8083;
http.createServer((req,res)=>{
  let p = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  fs.readFile(p,(e,b)=>{
    if (e) { res.writeHead(404); res.end('404'); return; }
    const ext = path.extname(p).toLowerCase();
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Access-Control-Allow-Origin':'*' });
    res.end(b);
  });
}).listen(port, '0.0.0.0', ()=>{ console.log(`Server: http://localhost:${port}`); });
