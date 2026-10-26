// Servidor estático mínimo para rodar o Mawe OS localmente.
// Sem dependências: usa apenas o módulo http do Node.
// Escuta somente em 127.0.0.1 — o sistema não fica exposto na rede.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT ?? 5173);
const HOST = process.env.HOST ?? '127.0.0.1';

// Apenas estas pastas podem ser servidas. Código-fonte .ts e arquivos de
// configuração ficam de fora.
const PUBLIC_PREFIXES = ['build/', 'src/styles/', 'public/'];

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

function resolveRequest(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^([/\\])+/, '');
  if (clean === '' || clean === 'index.html') return join(ROOT, 'index.html');
  const posix = clean.split(sep).join('/');
  if (!PUBLIC_PREFIXES.some((prefix) => posix.startsWith(prefix))) return null;
  const full = resolve(ROOT, clean);
  return full.startsWith(ROOT + sep) ? full : null;
}

const server = createServer(async (req, res) => {
  try {
    const file = resolveRequest(req.url ?? '/');
    if (!file || !(await stat(file)).isFile()) throw new Error('not found');
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Arquivo não encontrado');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Mawe OS rodando em http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}\n`);
});
