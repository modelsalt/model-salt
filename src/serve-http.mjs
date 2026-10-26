// Runs worker.mjs on a local port with node:http, to test the remote transport without Cloudflare
import { createServer } from 'node:http';
import { appendFileSync } from 'node:fs';
import worker from './worker.mjs';
import { setLogger } from './worker.mjs';

if (process.env.SALT_LOG) setLogger((e) => appendFileSync(process.env.SALT_LOG, JSON.stringify({ t: new Date().toISOString(), ...e }) + '\n'));

const port = Number(process.argv[2] || 6591);
createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const r = await worker.fetch(new Request(`http://127.0.0.1:${port}${req.url}`, { method: req.method, headers: req.headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body }));
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(port, '127.0.0.1', () => console.log(`services on http://127.0.0.1:${port}/<service>/mcp`));
