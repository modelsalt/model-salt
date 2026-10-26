// The Kimi client for the eval runs (Kimi K3 for the site's examples): what eval/gemini.mjs is for Gemini, on
// Moonshot's OpenAI-style chat API with the key, as a bare client: no system prompt and no tools of its own. With an MCP server
// (--mcp '{"command":"node","args":[...]}') it speaks MCP over stdio as Claude Code does: the server's instructions become the
// system message, its tools are the model's functions, and every call is answered by the server until the model ends with text.
//   node eval/kimi.mjs <model id> <out dir> [--mcp <json>] < prompt
// Writes into <out dir>: transcript.jsonl (each request's new messages and each response, no key), reply.txt (the last turn's
// text), seed.txt (the tool's replies), cost.json ({output_tokens, input_tokens}).
// The key: KIMI_API_KEY (the compute worker's env), else the Keychain item model-salt.kimi / api-key (this Mac).
import { writeFileSync, appendFileSync, readFileSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

const [model, out] = process.argv.slice(2);
const mcpArg = process.argv.includes('--mcp') ? JSON.parse(process.argv[process.argv.indexOf('--mcp') + 1]) : null;
const KEY = process.env.KIMI_API_KEY || execFileSync('security', ['find-generic-password', '-s', 'model-salt.kimi', '-a', 'api-key', '-w'], { encoding: 'utf8' }).trim();
const URL = process.env.KIMI_URL || 'https://api.moonshot.ai/v1/chat/completions';
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

// The reply comes as a stream: a long answer (a pelican's SVG after the tool call) sent whole took over 10 minutes
// to start, and the connection was cut before it did ("fetch failed", 10 runs of 24 Oct, each 5 tries in 56 minutes). Streamed,
// bytes flow from the first token; a stream silent for 5 minutes is cut here and tried again.
// An empty or broken account (no balance, suspended: Moonshot's 429 exceeded_current_quota_error) is never tried again: its error
// starts "NO_CREDIT", which eval/sitegen/worker.sh reads to hand the run back instead of failing it.
const QUOTA = /exceeded_current_quota|insufficient balance|credit balance|recharge/i;
const stream = async (body) => {
  const ctl = new AbortController(); let idle;
  const poke = () => { clearTimeout(idle); idle = setTimeout(() => ctl.abort(new Error('the stream was silent for 5 minutes')), 5 * 60e3); };
  poke();
  try {
    const r = await fetch(URL, { method: 'POST', headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ ...body, stream: true }), signal: ctl.signal });
    if (!r.ok) return { status: r.status, text: (await r.text()).slice(0, 1000) };
    const msg = { role: 'assistant', content: '' }, calls = []; let usage = null, finish = null, buf = '';
    const dec = new TextDecoder();
    for await (const chunk of r.body) {
      poke(); buf += dec.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim(); if (data === '[DONE]') continue;
        const j = JSON.parse(data), c = j.choices?.[0] || {}, d = c.delta || {};
        if (j.error) return { status: 500, text: JSON.stringify(j.error).slice(0, 1000) };
        if (d.content) msg.content += d.content;
        if (d.reasoning_content) msg.reasoning_content = (msg.reasoning_content || '') + d.reasoning_content;
        for (const t of d.tool_calls || []) {
          const k = t.index ?? calls.length; calls[k] ??= { id: '', type: 'function', function: { name: '', arguments: '' } };
          if (t.id) calls[k].id = t.id; if (t.function?.name) calls[k].function.name += t.function.name;
          if (t.function?.arguments) calls[k].function.arguments += t.function.arguments;
        }
        usage = j.usage || c.usage || usage; finish = c.finish_reason || finish;
      }
    }
    if (!finish) return { status: 0, text: 'the stream ended before the reply did' };
    if (calls.length) msg.tool_calls = calls.filter(Boolean);
    return { ok: true, json: { choices: [{ index: 0, message: msg, finish_reason: finish }], usage } };
  } catch (e) { return { status: 0, text: String(e?.cause?.message || e?.message || e) }; } finally { clearTimeout(idle); }
};
const post = async (body) => {
  for (let t = 1; ; t++) {
    const r = await stream(body);
    if (r.ok) return r.json;
    if (r.status === 429 && QUOTA.test(r.text)) throw new Error(`NO_CREDIT HTTP ${r.status}: ${r.text}`);
    // rate limits, the network and the API's own hiccups are tried again, with a growing wait; anything else (a bad key) is the run's error
    if (t >= 6 || ![0, 408, 429, 500, 502, 503, 504, 529].includes(r.status)) throw new Error(`HTTP ${r.status}: ${r.text}`);
    await new Promise((ok) => setTimeout(ok, Math.min(20e3 * 2 ** (t - 1), 5 * 60e3)));
  }
};

// A picture prompt (SALT_PICTURE=svg|html, set by eval/run.sh): this client has no image tool, as Codex has and Claude Code's SVG
// replies make up for, so one system line asks for the picture itself as code (a text answer to a picture
// prompt is a failed run: Gemini answered 3 app icons with concepts and a Midjourney prompt). The prompt text stays the same.
const PICTURE = { svg: 'You have no image tool. When the request asks for a picture, an icon or a drawing, reply with the picture itself as one complete SVG.', html: 'You have no image tool. When the request asks for a page or a design, reply with the page itself as one complete HTML document.' }[process.env.SALT_PICTURE || ''] || '';
const usage = { input_tokens: 0, output_tokens: 0 };
let reply = '', seed = '';
try {
  const body = { model, messages: [{ role: 'user', content: readFileSync(0, 'utf8') }], max_tokens: 65536 };
  if (rpc) {
    const init = await rpc.call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'kimi-eval', version: '1.0.0' } });
    rpc.note('notifications/initialized');
    const tools = (await rpc.call('tools/list', {})).result?.tools || [];
    if (init.result?.instructions) body.messages.unshift({ role: 'system', content: init.result.instructions });
    body.tools = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } }));
  }
  if (PICTURE) { if (body.messages[0].role === 'system') body.messages[0].content += `\n\n${PICTURE}`; else body.messages.unshift({ role: 'system', content: PICTURE }); }
  let sent = 0;
  for (let turn = 1; turn <= TURNS; turn++) {
    log({ type: 'request', turn, messages: body.messages.slice(sent) }); sent = body.messages.length;
    const r = await post(body);
    log({ type: 'response', turn, ...r });
    usage.input_tokens += r.usage?.prompt_tokens || 0;
    usage.output_tokens += r.usage?.completion_tokens || 0;
    const msg = r.choices?.[0]?.message || { role: 'assistant', content: '' };
    body.messages.push(msg); // as it came, reasoning_content included (Kimi wants it back with its tool calls)
    reply = msg.content || '';
    const calls = msg.tool_calls || [];
    if (!calls.length || !rpc) break;
    for (const c of calls) {
      let args = {}; try { args = JSON.parse(c.function?.arguments || '{}'); } catch {}
      const res = await rpc.call('tools/call', { name: c.function?.name, arguments: args });
      const text = res.error ? `Error: ${res.error.message}` : (res.result?.content || []).map((x) => x.text || '').join('');
      seed += text + '\n';
      body.messages.push({ role: 'tool', tool_call_id: c.id, name: c.function?.name, content: text });
    }
  }
} catch (e) {
  console.error(String(e?.message || e));
  log({ type: 'error', error: String(e?.message || e) });
} finally { rpc?.p.kill(); }
writeFileSync(join(out, 'reply.txt'), reply);
writeFileSync(join(out, 'seed.txt'), seed);
writeFileSync(join(out, 'cost.json'), JSON.stringify(usage) + '\n');
process.exit(reply ? 0 : 1);
