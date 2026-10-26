// Remote transport: stateless Streamable HTTP, one endpoint per service at /<service>/mcp (e.g. /anthropic/mcp).
// Runs as a Cloudflare Worker (export default fetch).
import { makeHandler } from './server.mjs';
import { SERVICES } from './services.mjs';
import { configure } from './entropy.mjs';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
let log = () => {};
export function setLogger(fn) { log = fn; }
const handlers = {};
const handler = (id) => (handlers[id] ||= makeHandler(SERVICES[id], { log: (e) => log({ service: id, ...e }) }));
const index = () => `One MCP server per model family. Add the one for your model as a remote MCP server:\n${Object.values(SERVICES).map((s) => `  ${s.familyName}: https://<this host>/${s.id}/mcp`).join('\n')}\n`;

export default {
  async fetch(req, env) {
    configure(env || {});
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const m = url.pathname.match(/^\/([^/]+)\/mcp\/?$/);
    if (!m || !SERVICES[m[1]]) return new Response(index(), { status: m ? 404 : 200, headers: { 'content-type': 'text/plain', ...CORS } });
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { allow: 'POST', ...CORS } });
    let body;
    try { body = await req.json(); } catch { return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400, headers: CORS }); }
    const handle = handler(m[1]);
    const replies = (await Promise.all((Array.isArray(body) ? body : [body]).map((x) => handle(x, { userAgent: req.headers.get('user-agent') || '', client: req.headers.get('mcp-client') || '' })))).filter(Boolean);
    if (!replies.length) return new Response(null, { status: 202, headers: CORS });
    return Response.json(Array.isArray(body) ? replies : replies[0], { headers: CORS });
  },
};
