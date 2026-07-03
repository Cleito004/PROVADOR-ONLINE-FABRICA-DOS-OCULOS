const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 5500;
const PORT_HTTPS = 5501;
const ROOT = path.join(__dirname, 'kiosk');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.hdr': 'image/vnd.radiance',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
};

const SILENT_404 = ['/.git', '/.well-known', '/security.txt', '/favicon.ico'];

function handler(req, res) {
  let url = req.url.split('?')[0];
  if (url === '/') url = '/index.html';

  const shouldSilent = SILENT_404.some(p => url === p || url.startsWith(p + '/'));
  if (shouldSilent) {
    res.writeHead(204);
    res.end();
    return;
  }

  const filePath = path.join(ROOT, url);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end();
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Permissions-Policy': 'camera=(self)',
    });
    res.end(data);
  });
}

function getIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address);
    }
  }
  return ips;
}

function printURLs(protocol, port, label) {
  const ips = getIPs();
  console.log(`  ${label}:`);
  console.log(`    Local:    ${protocol}://localhost:${port}`);
  for (const ip of ips) {
    console.log(`    Rede:     ${protocol}://${ip}:${port}`);
  }
}

const httpServer = http.createServer(handler);

let httpsServer = null;
const pfxPath = path.join(os.tmpdir(), 'kiosk-cert.pfx');
if (fs.existsSync(pfxPath)) {
  try {
    const pfx = fs.readFileSync(pfxPath);
    httpsServer = https.createServer({ pfx, passphrase: '' }, handler);
  } catch (e) {
    console.log(`  ${String.fromCodePoint(0x26A0)} Certificado SSL inválido, remova-o e execute novamente:`);
    console.log(`    Remove-Item "${pfxPath}"`);
  }
}

httpServer.listen(PORT, () => {
  console.log(`\n  ${String.fromCodePoint(0x1F4F1)} Provador Virtual rodando!\n`);
  printURLs('http', PORT, 'HTTP (sem câmera)');
  if (httpsServer) {
    console.log('');
    printURLs('https', PORT_HTTPS, 'HTTPS (com câmera)');
    console.log(`\n  ${String.fromCodePoint(0x26A0)}  HTTPS usa certificado auto-assinado. No celular/tablet:`);
    console.log(`     Aceite o aviso de segurança para usar a câmera.\n`);
  } else {
    console.log(`\n  ${String.fromCodePoint(0x26A0)}  Para usar a câmera de outro dispositivo,`)
    console.log(`     gere o certificado SSL e reinicie:`);
    console.log(`     .\\gerar-ssl.ps1\n`);
  }
});

if (httpsServer) {
  httpsServer.listen(PORT_HTTPS, () => {});
}
