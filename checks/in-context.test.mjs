// The explore step's two homes (1.0.2): with a claude or codex CLI on the machine the server runs it in its own model call
// (src/runner.mjs) and returns the decided answers in one tool call; with none (a Docker container, Cursor or Copilot alone) the
// calling model does it itself in two calls. The CLI run is a fake that records it was called, and stdio.mjs is
// started with SALT_CLAUDE pointing at a CLI that exists or not: no model, no sign-in.
// usage: node --test checks/in-context.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeHandler } from '../src/server.mjs';
import { load } from '../src/services.mjs';
import { curveQuestionsFor, answersFor } from '../src/template-steps.mjs';
import * as inContext from '../src/in-context.mjs';

const REQUEST = 'Write a haiku about autumn.';
const callTool = (handle, args, id = 1) => handle({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'model_salt', arguments: { model: 'claude-opus-5-5', ...args } } }, {});
const list = async (handle) => (await handle({ jsonrpc: '2.0', id: 9, method: 'tools/list' }, {})).result.tools[0];

// a well-formed exploring reply at setting 1: the question and answer counts the step asks for, shares, picks and the json block
function explored() {
  const nq = curveQuestionsFor(1), na = answersFor(1);
  const qs = Array.from({ length: nq }, (_, i) => ({ q: `Question ${i + 1}?`, answers: Array.from({ length: na }, (_, k) => `answer ${i + 1}.${k + 1}`) }));
  const lines = qs.map((q, i) => `Q${i + 1}: ${q.q}\n${q.answers.map((a, k) => `w, A${k + 1}: ${a} [${Math.round(100 / na)}%]`).join('\n')}`).join('\n');
  return `${lines}\n\n\`\`\`json\n${JSON.stringify({ questions: qs, picks: qs.map(() => 1) })}\n\`\`\``;
}

test('CLI present: one call, the explore step runs in the service\'s own model call', async () => {
  let ran = 0;
  const stage1 = async () => { ran++; return { ok: true, text: 'decided by the CLI run', calls: [] }; };
  const handle = makeHandler(await load('anthropic'), { stage1 });
  const tool = await list(handle);
  assert.deepEqual(tool.inputSchema.required, ['model', 'request']);
  assert.equal(tool.inputSchema.properties.id, undefined);
  assert.match(tool.description, /^Call this once before/);
  const r = await callTool(handle, { request: REQUEST });
  assert.equal(ran, 1);
  assert.equal(r.result.content[0].text, 'decided by the CLI run');
});

test('CLI absent: two calls, the calling model does the explore step and code picks from it', async () => {
  const service = await load('anthropic');
  let ran = 0;
  const stage1 = Object.assign(async (...a) => { if (!a[3]?.call) ran++; return service.stage1(...a); }, service.stage1);
  const handle = makeHandler({ ...service, stage1 }, { inContext, repeatWindowMs: 60000 });
  const tool = await list(handle);
  assert.deepEqual(tool.inputSchema.required, ['model']);
  assert.ok(tool.inputSchema.properties.id && tool.inputSchema.properties.explored);
  const one = (await callTool(handle, { request: REQUEST })).result.content[0].text;
  assert.match(one, /^Model Salt, step 1 of 2 \(id [\w-]+\)/);
  assert.match(one, /Write a haiku about autumn\./);
  const id = one.match(/\(id ([\w-]+)\)/)[1];
  const two = (await callTool(handle, { id, explored: explored() }, 2)).result.content[0].text;
  assert.match(two, /^Model Salt, step 2 of 2, the last call: decided for "Write a haiku about autumn\."/);
  assert.match(two, /- Question 1\? answer 1\.\d/);
  assert.equal(ran, 0, 'no CLI run in the two-call flow');
  // a second call for the same request in the session gets the same decided answers
  assert.equal((await callTool(handle, { request: REQUEST }, 3)).result.content[0].text, two);
});

// stdio.mjs picks the flow at start: SALT_CLAUDE at a CLI that exists keeps the one-call tool, at a missing one gives the two calls
async function listed(env) {
  const p = spawn(process.execPath, [join(import.meta.dirname, '../src/stdio.mjs'), 'anthropic'], { env: { ...process.env, SALT_IN_CONTEXT: '', ...env }, stdio: ['pipe', 'pipe', 'inherit'] });
  let out = '';
  p.stdout.on('data', (c) => (out += c));
  p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) + '\n');
  await new Promise((res) => { const t = setInterval(() => { if (out.includes('\n')) { clearInterval(t); res(); } }, 20); });
  p.kill();
  return JSON.parse(out.split('\n')[0]).result.tools[0].inputSchema;
}
test('stdio: a CLI on the machine keeps the one call, none gives the two calls', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'salt-cli.'));
  try {
    const fake = join(dir, 'claude');
    writeFileSync(fake, '#!/bin/sh\nexit 0\n'); chmodSync(fake, 0o755);
    assert.deepEqual((await listed({ SALT_CLAUDE: fake })).required, ['model', 'request']);
    assert.deepEqual((await listed({ SALT_CLAUDE: join(dir, 'missing/claude') })).required, ['model']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
