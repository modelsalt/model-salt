#!/usr/bin/env node
// Local transport: newline-delimited JSON-RPC on stdin/stdout.
// usage: node src/stdio.mjs <service> [--steps <file>] [--log <file>]   (published: npx -y @modelsalt/model-salt <service>)
//        node src/stdio.mjs setup <client>   adds the server to a client in one step; uninstall <client> takes it out (src/setup.mjs)
//   <service> is a folder name under services/ (anthropic, openai); --steps runs another steps file (an eval arm)
import { createInterface } from 'node:readline';
import { appendFileSync } from 'node:fs';
import { makeHandler } from './server.mjs';
import { load } from './services.mjs';

if (process.argv[2] === 'setup' || process.argv[2] === 'uninstall') process.exit((await import('./setup.mjs'))[process.argv[2]](process.argv.slice(3)));
// a person at a terminal (not an MCP client, which never has a TTY on stdin) gets the commands instead of a silent server
if (['-h', '--help', 'help', '-v', '--version'].includes(process.argv[2]) || (process.argv.length === 2 && process.stdin.isTTY)) {
  const { version } = JSON.parse((await import('node:fs')).readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  if (/^-v|--version$/.test(process.argv[2] || '')) console.log(version);
  else console.log(`Model Salt ${version}: randomness from outside your model, so one prompt gives different answers. https://modelsalt.com

  npx -y @modelsalt/model-salt setup <claude|codex|gemini|kimi>       add it to your client (--dry-run shows what it would change)
  npx -y @modelsalt/model-salt uninstall <claude|codex|gemini|kimi>   take out everything setup added
  npx -y @modelsalt/model-salt <anthropic|openai>                     the MCP server over stdio, for a client to start`);
  process.exit(0);
}

const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const service = await load(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'anthropic');
const logFile = arg('--log') || process.env.SALT_LOG;
const stepsFile = arg('--steps');
const mod = stepsFile ? await import(new URL(stepsFile, `file://${process.cwd()}/`).href) : {};
const steps = mod.default, description = mod.description, instructions = mod.instructions; // a steps file may also export its own tool description, choose and answer (codepick.mjs)
const calls = stepsFile ? { choose: mod.choose || null, answer: mod.answer || null, stage1: mod.stage1 || null } : {}; // an eval arm brings its own, or none
const handle = makeHandler(service, { steps, ...(description ? { description } : {}), ...calls, ...(instructions ? { instructions } : {}), repeatWindowMs: 5 * 60 * 1000, log: logFile ? (e) => appendFileSync(logFile, JSON.stringify({ t: new Date().toISOString(), service: service.id, ...e }) + '\n') : undefined });

let client = ''; // the MCP client's clientInfo from initialize, for the log
createInterface({ input: process.stdin }).on('line', async (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.method === 'initialize') client = `${msg.params?.clientInfo?.name || ''}/${msg.params?.clientInfo?.version || ''}`;
  const reply = await handle(msg, { client });
  if (reply) process.stdout.write(JSON.stringify(reply) + '\n');
});
