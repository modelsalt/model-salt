// Stage 1 in its own model run: the explore step runs apart from the user's conversation, and the request then goes on with only the
// decided answers, without the explore context (fewer tokens, and the random input can't pull the answer off the brief). Neither MCP client
// offers sampling (Claude Code 2.1.304: roots and elicitation; Codex 0.162: elicitation), so the service runs the explore step itself,
// on the machine's own Claude or Codex sign-in (the plans, $0): each call a fresh process in an empty temp dir, no tools, no MCP
// servers, plugins or skills, a one-line system prompt. The client's context then gets only the decided answers. Node only (child_process): the
// HTTP worker can't run it and keeps the in-context steps.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

const CLAUDE = process.env.SALT_CLAUDE || [join(homedir(), '.local/bin/claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude'].find(existsSync) || 'claude';
const CODEX = process.env.SALT_CODEX || ['/Applications/Codex.app/Contents/Resources/codex-cli/bin/codex', '/opt/homebrew/bin/codex', '/usr/local/bin/codex'].find(existsSync) || 'codex';
const SYSTEM = 'You are a helpful assistant.';

// Codex 0.162 merges `-c mcp_servers={}` into the user's servers instead of replacing them, so the explore run still had model_salt,
// and with the Model Salt skill (or an AGENTS.md line) it called it again, over and over (26 Oct). The run now turns off
// each server the user has by name, every plugin and the skills block; the rest of their config (model settings) still applies.
let codexOff;
export function codexIsolation(env = {}) {
  if (!codexOff) {
    const r = spawnSync(CODEX, ['mcp', 'list', '--json', '--disable', 'plugins'], { env: { ...process.env, ...env }, encoding: 'utf8', timeout: 30000 });
    let names = [];
    try { names = JSON.parse(r.stdout).map((s) => s.name).filter(Boolean); } catch {}
    const key = (n) => (/^[A-Za-z0-9_-]+$/.test(n) ? n : JSON.stringify(n));
    codexOff = ['--disable', 'plugins', '-c', 'skills.include_instructions=false', '-c', 'mcp_servers={}', ...names.flatMap((n) => ['-c', `mcp_servers.${key(n)}.enabled=false`])];
  }
  return codexOff;
}

function exec(bin, args, input, cwd, env) {
  return new Promise((resolve) => {
    const p = spawn(bin, args, { cwd, env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => p.kill(), 15 * 60 * 1000);
    p.stdout.on('data', (c) => (out += c)); p.stderr.on('data', (c) => (err += c));
    p.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, out, err: String(e) }); });
    p.on('close', (code) => { clearTimeout(timer); resolve({ code, out, err }); });
    p.stdin.end(input);
  });
}

// one call to a fresh model: { text, usage: { input, cached, output } } (input counts every prompt token, cached ones included)
export async function call(model, prompt) {
  const tmp = mkdtempSync(join(tmpdir(), 'seed-run.'));
  try {
    if (/^gpt/i.test(model)) {
      const env = process.env.SEED_CODEX_HOME ? { CODEX_HOME: process.env.SEED_CODEX_HOME } : {};
      const r = await exec(CODEX, ['exec', '--skip-git-repo-check', '--ephemeral', '-s', 'read-only', '-m', model, ...codexIsolation(env), '--json', '-o', join(tmp, 'reply.txt'), '-'], prompt, tmp, env);
      const text = existsSync(join(tmp, 'reply.txt')) ? readFileSync(join(tmp, 'reply.txt'), 'utf8') : '';
      const usage = { input: 0, cached: 0, output: 0 };
      for (const l of r.out.split('\n')) {
        try { const j = JSON.parse(l); const u = j.type === 'turn.completed' && j.usage; if (u) { usage.input += u.input_tokens || 0; usage.cached += u.cached_input_tokens || 0; usage.output += u.output_tokens || 0; } } catch {}
      }
      return { text, usage, raw: r.out, error: text ? '' : (r.err || r.out).slice(-500) };
    }
    if (/^(gemini|kimi)/i.test(model)) {
      // Gemini and Kimi: one call on the provider's API with the key, through the eval runs' own client
      const r = await exec(process.execPath, [join(import.meta.dirname, `../eval/${model.split('-')[0].toLowerCase()}.mjs`), model, tmp], prompt, tmp);
      const text = existsSync(join(tmp, 'reply.txt')) ? readFileSync(join(tmp, 'reply.txt'), 'utf8') : '';
      let u = {}; try { u = JSON.parse(readFileSync(join(tmp, 'cost.json'), 'utf8')); } catch {}
      return { text, usage: { input: u.input_tokens || 0, cached: 0, output: u.output_tokens || 0 }, raw: r.out, error: text ? '' : (r.err || r.out).slice(-500) };
    }
    const r = await exec(CLAUDE, ['-p', '--model', model, '--strict-mcp-config', '--setting-sources', '', '--tools', '', '--system-prompt', SYSTEM, '--output-format', 'json'], prompt, tmp);
    let j = {};
    try { j = JSON.parse(r.out); } catch {}
    const u = j.usage || {};
    const cached = (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    return { text: j.result || '', usage: { input: (u.input_tokens || 0) + cached, cached, output: u.output_tokens || 0 }, usd: j.total_cost_usd || 0, raw: r.out, error: j.result ? '' : (r.err || r.out).slice(-500) };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

// questions with their answers from a reply: "Q1: ..." lines, each followed by "- ..." answer lines (research/lab.py parse)
export function parse(reply) {
  const out = [];
  let cur = null;
  for (const line of reply.split('\n')) {
    let m = line.match(/^\s*\**\s*Q(\d)\s*\**\s*[:.)]\s*\**\s*(.+?)\s*\**\s*$/);
    if (m) { cur = { n: +m[1], q: m[2].replace(/^\*+|\*+$/g, '').trim(), a: [] }; out.push(cur); continue; }
    m = line.match(/^\s*(?:[-*•]|\d+[.)]|[a-e][.)])\s+(.+?)\s*$/);
    if (cur && m && cur.a.length < 5) cur.a.push(m[1].replace(/^\*+|\*+$/g, '').trim());
  }
  const byn = new Map();
  for (const q of out) if (q.a.length || !byn.has(q.n)) byn.set(q.n, q);
  return [...byn.values()].sort((a, b) => a.n - b.n).slice(0, 5).map(({ q, a }) => ({ q, a }));
}
