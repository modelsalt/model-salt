// The Gemini client for the eval runs (Gemini 4 Argon for the site's examples): what Claude Code -p and Codex exec are
// for the other families, straight on the Gemini API with the key, as a bare client: no system prompt and no tools of its own. With
// an MCP server (--mcp '{"command":"node","args":[...]}') it speaks MCP over stdio as Claude Code does: the server's instructions
// become the system instruction, its tools are the model's functions, and every call is answered by the server until the model
// ends with text.
//   node eval/gemini.mjs <model id> <out dir> [--mcp <json>] < prompt
// Writes into <out dir>: transcript.jsonl (each request's turn and each response, no key), reply.txt (the last turn's text),
// seed.txt (the tool's replies), cost.json ({output_tokens, input_tokens}).
// The key: GEMINI_API_KEY (the compute worker's env), else the Keychain item model-salt.gemini / api-key (this Mac).
import { writeFileSync, appendFileSync, readFileSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

const [model, out] = process.argv.slice(2);
const mcpArg = process.argv.includes('--mcp') ? JSON.parse(process.argv[process.argv.indexOf('--mcp') + 1]) : null;
const KEY = process.env.GEMINI_API_KEY || execFileSync('security', ['find-generic-password', '-s', 'model-salt.gemini', '-a', 'api-key', '-w'], { encoding: 'utf8' }).trim();
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
const TURNS = 10;
const log = (o) => appendFileSync(join(out, 'transcript.jsonl'), JSON.stringify(o) + '\n');
writeFileSync(join(out, 'transcript.jsonl'), '');

// the MCP server over stdio: newline-delimited JSON-RPC
let rpc = null;
if (mcpArg) {
  const p = spawn(mcpArg.command, mcpArg.args || [], { stdio: ['pipe', 'pipe', 'inherit'] });
  const wait = new Map(); let n = 0;
  createInterface({ input: p.stdout }).on('line', (l) => { try { const m = JSON.parse(l); wait.get(m.id)?.(m); wait.delete(m.id); } catch {} });
  rpc = { p, call: (method, params) => new Promise((ok) => { const id = ++n; wait.set(id, ok); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); }),
    note: (method) => p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n') };
}

const post = async (body) => {
  for (let t = 1; ; t++) {
    const r = await fetch(URL, { method: 'POST', headers: { 'x-goog-api-key': KEY, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15 * 60e3) }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
    if (r.ok) return r.json();
    const text = (await r.text()).slice(0, 1000);
    // a key whose project has no billing or no quota left is never tried again: "NO_CREDIT" tells eval/sitegen/worker.sh to hand the run back
    if ([400, 403].includes(r.status) && /billing/i.test(text) || r.status === 429 && /billing|prepay|credit/i.test(text)) throw new Error(`NO_CREDIT HTTP ${r.status}: ${text}`);
    // rate limits and the API's own hiccups are tried again; anything else is the run's error
    if (t >= 5 || ![0, 429, 500, 502, 503, 504].includes(r.status)) throw new Error(`HTTP ${r.status}: ${text}`);
    await new Promise((ok) => setTimeout(ok, 15e3 * t));
  }
};

// A picture prompt (SALT_PICTURE=svg|html, set by eval/run.sh): this client has no image tool, as Codex has and Claude Code's SVG
// replies make up for, so one system line asks for the picture itself as code (a text answer to a picture
// prompt is a failed run: Gemini answered 3 app icons with concepts and a Midjourney prompt). The prompt text stays the same.
const PICTURE = { svg: 'You have no image tool. When the request asks for a picture, an icon or a drawing, reply with the picture itself as one complete SVG.', html: 'You have no image tool. When the request asks for a page or a design, reply with the page itself as one complete HTML document.' }[process.env.SALT_PICTURE || ''] || '';
const usage = { input_tokens: 0, output_tokens: 0 };
let reply = '', seed = '';
try {
  const body = { contents: [{ role: 'user', parts: [{ text: readFileSync(0, 'utf8') }] }], generationConfig: { maxOutputTokens: 65536 } };
  if (rpc) {
    const init = await rpc.call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'gemini-eval', version: '1.0.0' } });
    rpc.note('notifications/initialized');
    const tools = (await rpc.call('tools/list', {})).result?.tools || [];
    if (init.result?.instructions) body.systemInstruction = { parts: [{ text: init.result.instructions }] };
    body.tools = [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.inputSchema })) }];
  }
  if (PICTURE) body.systemInstruction = { parts: [...(body.systemInstruction?.parts || []), { text: PICTURE }] };
  for (let turn = 1; turn <= TURNS; turn++) {
    log({ type: 'request', turn, content: body.contents.at(-1) });
    const r = await post(body);
    log({ type: 'response', turn, ...r });
    usage.input_tokens += r.usageMetadata?.promptTokenCount || 0;
    usage.output_tokens += (r.usageMetadata?.candidatesTokenCount || 0) + (r.usageMetadata?.thoughtsTokenCount || 0);
    const content = r.candidates?.[0]?.content || { role: 'model', parts: [] };
    const parts = content.parts || [];
    body.contents.push({ role: 'model', parts }); // as it came, thought signatures included
    reply = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('');
    const calls = parts.filter((p) => p.functionCall);
    if (!calls.length || !rpc) break;
    const answers = [];
    for (const { functionCall: c } of calls) {
      const res = await rpc.call('tools/call', { name: c.name, arguments: c.args || {} });
      const text = res.error ? `Error: ${res.error.message}` : (res.result?.content || []).map((x) => x.text || '').join('');
      seed += text + '\n';
      answers.push({ functionResponse: { name: c.name, ...(c.id ? { id: c.id } : {}), response: res.error ? { error: text } : { output: text } } });
    }
    body.contents.push({ role: 'user', parts: answers });
  }
} catch (e) {
  console.error(String(e?.message || e));
  log({ type: 'error', error: String(e?.message || e) });
} finally { rpc?.p.kill(); }
writeFileSync(join(out, 'reply.txt'), reply);
writeFileSync(join(out, 'seed.txt'), seed);
writeFileSync(join(out, 'cost.json'), JSON.stringify(usage) + '\n');
process.exit(reply ? 0 : 1);
