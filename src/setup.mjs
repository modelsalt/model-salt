// One-step install and uninstall per client, each through the strongest way in that client has (measured
// 26 Oct 2026, Codex 0.162 runs on gpt-6.1-sol):
//   claude, gemini: `mcp add`; both pass the server's instructions on to the model, so nothing else.
//   codex: Codex hides MCP tools behind its tool_search and shows the server's instructions only as a source label there, so the
//          model called the tool 0 of 6 times. setup adds the server, `omit_tools_from = ["deferred"]` in its config table (the tool
//          is listed up front) and the skill in ~/.agents/skills, and removes the AGENTS.md line older setups added. With the real
//          server: 6 of 6 creative requests called it, 0 of 3 questions with one right answer; up front alone, 3 of 3.
//   kimi:  Kimi Code has no `mcp add` and reads no server instructions: the server in ~/.kimi-code/mcp.json and the same skill
//          (Kimi reads ~/.agents/skills too). No signed-in Kimi run has checked the skill yet, so --agents-md still adds the line.
// A second setup changes nothing. The skill is shared by codex and kimi: uninstall removes it once neither has the server.
// usage: npx -y @modelsalt/model-salt setup <claude|codex|gemini|kimi> [--agents-md] [--dry-run]
//        npx -y @modelsalt/model-salt uninstall <claude|codex|gemini|kimi> [--dry-run]
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, unlinkSync, readdirSync, rmdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

export const LINE = 'Before any task with room for choices, call model_salt once and follow what it returns.';
const NAME = 'model-salt';
const SKILL = new URL('../plugin/skills/model-salt/SKILL.md', import.meta.url);
const run = (family) => ['npx', '-y', '@modelsalt/model-salt', family];
const home = (env, dir) => process.env[env] || join(homedir(), dir);
const codexConfig = () => join(home('CODEX_HOME', '.codex'), 'config.toml');
const kimiMcp = () => join(home('KIMI_CODE_HOME', '.kimi-code'), 'mcp.json');
const skillDir = () => join(homedir(), '.agents', 'skills', NAME);
const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
const pruneEmpty = (...dirs) => { for (const d of dirs) if (existsSync(d) && !readdirSync(d).length) rmdirSync(d); }; // folders setup made, once nothing is left in them
const TABLE = /^\[mcp_servers\.(?:model-salt|"model-salt")\]\s*$/m;
const OMIT = 'omit_tools_from = ["deferred"]';

// Adds OMIT to the server's own table in Codex's config.toml, right under its header (keys there come before any subtable).
export function addOmit(toml) {
  const m = TABLE.exec(toml);
  if (!m) return null;
  const start = m.index + m[0].length, next = toml.slice(start).search(/^\[/m), body = toml.slice(start, next < 0 ? undefined : start + next);
  if (/^\s*omit_tools_from\s*=/m.test(body)) return toml;
  return `${toml.slice(0, start)}\n${OMIT}${toml.slice(start)}`;
}

// Drops the line from an instructions file, with the blank line setup put before it; a file left empty is removed.
export function dropLine(text) {
  const out = text.split('\n').filter((l) => l.trim() !== LINE).join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
  return out ? out + '\n' : '';
}

const has = { codex: () => TABLE.test(read(codexConfig())), kimi: () => !!JSON.parse(read(kimiMcp()) || '{}').mcpServers?.[NAME] };

const CLIENTS = {
  claude: { family: 'anthropic', add: (r) => ['claude', 'mcp', 'add', '-s', 'user', NAME, '--', ...r], remove: ['claude', 'mcp', 'remove', '-s', 'user', NAME] },
  codex: { family: 'openai', add: (r) => ['codex', 'mcp', 'add', NAME, '--', ...r], remove: ['codex', 'mcp', 'remove', NAME], omit: true, skill: true, line: () => join(home('CODEX_HOME', '.codex'), 'AGENTS.md'), lineOptIn: false },
  gemini: { family: 'anthropic', add: (r) => ['gemini', 'mcp', 'add', '-s', 'user', NAME, ...r], remove: ['gemini', 'mcp', 'remove', '-s', 'user', NAME] },
  kimi: { family: 'anthropic', file: kimiMcp, skill: true, line: () => join(home('KIMI_CODE_HOME', '.kimi-code'), 'AGENTS.md'), lineOptIn: true },
};

function client(argv, verb) {
  const id = argv[0], c = CLIENTS[id];
  if (!c) console.error(`usage: npx -y @modelsalt/model-salt ${verb} <${Object.keys(CLIENTS).join('|')}>${verb === 'setup' ? ' [--agents-md]' : ''} [--dry-run]`);
  return [id, c];
}

// okIf: a failure whose output matches it counts as done (`claude mcp add` refuses a server it already has: a second setup is fine)
function sh(cmd, dry, say, okIf) {
  say(`run: ${cmd.join(' ')}`);
  if (dry) return 0;
  const p = spawnSync(cmd[0], cmd.slice(1), okIf ? { encoding: 'utf8' } : { stdio: 'inherit' });
  if (p.error) { console.error(`${cmd[0]} is not on your PATH: install it first, or run the line above yourself.`); return 1; }
  const out = okIf ? `${p.stdout || ''}${p.stderr || ''}` : '';
  if (p.status && okIf?.test(out)) { console.log(`${NAME} is already there`); return 0; }
  if (okIf) process[p.status ? 'stderr' : 'stdout'].write(out);
  return p.status || 0;
}

function removeLine(f, dry, say) {
  const had = read(f);
  if (!had.split('\n').some((l) => l.trim() === LINE)) return;
  const left = dropLine(had);
  say(`remove the Model Salt line from ${f}${left ? '' : ' (and the file, which held nothing else)'}`);
  if (!dry) left ? writeFileSync(f, left) : unlinkSync(f);
}

export function setup(argv) {
  const [id, c] = client(argv, 'setup');
  if (!c) return 2;
  const dry = argv.includes('--dry-run'), r = run(c.family), say = (s) => console.log(dry ? `would ${s}` : s);
  if (c.add) { const s = sh(c.add(r), dry, say, /already exists/i); if (s) return s; }
  if (c.omit) {
    const f = codexConfig(), toml = read(f), next = addOmit(toml);
    if (dry) say(`add ${OMIT} to [mcp_servers.${NAME}] in ${f}, so Codex lists the tool up front`);
    else if (next === null) { console.error(`no [mcp_servers.${NAME}] table in ${f}: add ${OMIT} to it yourself`); return 1; }
    else if (next !== toml) { say(`add ${OMIT} to [mcp_servers.${NAME}] in ${f}, so Codex lists the tool up front`); writeFileSync(f, next); }
  }
  if (c.file) {
    const f = c.file(), j = JSON.parse(read(f) || '{}'), entry = { command: r[0], args: r.slice(1) };
    if (JSON.stringify(j.mcpServers?.[NAME]) !== JSON.stringify(entry)) { // a second setup changes nothing
      j.mcpServers = { ...j.mcpServers, [NAME]: entry };
      say(`add ${NAME} to ${f}`);
      if (!dry) { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(j, null, 2) + '\n'); }
    }
  }
  if (c.skill) {
    const f = join(skillDir(), 'SKILL.md'), body = readFileSync(SKILL, 'utf8');
    if (read(f) !== body) {
      say(`write the Model Salt skill to ${f}`);
      if (!dry) { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, body); }
    }
  }
  if (c.line) {
    const f = c.line(), had = read(f), there = had.split('\n').some((l) => l.trim() === LINE);
    if (c.lineOptIn && argv.includes('--agents-md')) {
      if (there) console.log(`${f} already has the line`);
      else {
        say(`add this line to ${f}: ${LINE}`);
        if (!dry) { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, `${had}${had && !had.endsWith('\n') ? '\n' : ''}${had ? '\n' : ''}${LINE}\n`); }
      }
    } else if (!c.lineOptIn) removeLine(f, dry, say); // codex: the skill and the up-front listing replace it
    else if (there) console.log(`${f} still has the Model Salt line from an earlier setup; it is kept beside the skill. To drop it: \`npx -y @modelsalt/model-salt uninstall kimi\`, then \`npx -y @modelsalt/model-salt setup kimi\`.`);
  }
  if (!dry) console.log(`Model Salt is set up for ${id}. Start a new session to use it.`);
  return 0;
}

export function uninstall(argv) {
  const [id, c] = client(argv, 'uninstall');
  if (!c) return 2;
  const dry = argv.includes('--dry-run'), say = (s) => console.log(dry ? `would ${s}` : s);
  if (c.remove && (id !== 'codex' || has.codex())) { const s = sh(c.remove, dry, say); if (s) return s; }
  if (c.file && has.kimi()) {
    const f = c.file(), j = JSON.parse(read(f));
    delete j.mcpServers[NAME];
    if (!Object.keys(j.mcpServers).length) delete j.mcpServers;
    say(`remove ${NAME} from ${f}${Object.keys(j).length ? '' : ' (and the file, which held nothing else)'}`);
    if (!dry) Object.keys(j).length ? writeFileSync(f, JSON.stringify(j, null, 2) + '\n') : unlinkSync(f);
  }
  if (c.line) removeLine(c.line(), dry, say);
  if (c.skill && existsSync(skillDir())) {
    const other = Object.keys(has).find((k) => k !== id && has[k]());
    if (other) console.log(`${skillDir()} is kept: ${other} still uses it`);
    else { say(`remove ${skillDir()}`); if (!dry) rmSync(skillDir(), { recursive: true, force: true }); }
  }
  if (!dry) pruneEmpty(dirname(skillDir()), dirname(dirname(skillDir())), ...(c.file ? [dirname(c.file())] : []));
  if (!dry) console.log(`Model Salt is removed from ${id}.`);
  return 0;
}
