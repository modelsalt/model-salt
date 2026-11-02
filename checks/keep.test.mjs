// keep (ask 5909): the user's kept answers from an earlier Model Salt reply. The explore step gets them as settled, the reply starts
// with a Kept line, an item that no longer fits is dropped and named, and with no keep nothing changes. The explore run is a fake
// that records its prompt: no model, no sign-in.
// usage: node --test checks/keep.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHandler } from '../src/server.mjs';
import { load } from '../src/services.mjs';
import { curveQuestionsFor, answersFor, keepItems } from '../src/template-steps.mjs';
import * as inContext from '../src/in-context.mjs';

const REQUEST = 'Design a landing page hero for my bakery, Crumb & Co.';
const PALETTE = 'palette = burnt orange on cream', LAYOUT = 'layout = split screen, text left';
const callTool = (handle, args, id = 1) => handle({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'model_salt', arguments: { model: 'claude-opus-5-5', request: REQUEST, ...args } } }, {});
const textOf = (r) => r.result.content[0].text;

// a well-formed explore reply at setting 1, with "dropped" in its json block when given
function explored(dropped) {
  const nq = curveQuestionsFor(1), na = answersFor(1);
  const qs = Array.from({ length: nq }, (_, i) => ({ q: `Question ${i + 1}?`, answers: Array.from({ length: na }, (_, k) => `answer ${i + 1}.${k + 1}`) }));
  const lines = qs.map((q, i) => `Q${i + 1}: ${q.q}\n${q.answers.map((a, k) => `w, A${k + 1}: ${a} [${Math.round(100 / na)}%]`).join('\n')}`).join('\n');
  return `${lines}\n\n\`\`\`json\n${JSON.stringify({ questions: qs, picks: qs.map(() => 1), ...(dropped ? { dropped } : {}) })}\n\`\`\``;
}
// the service's real stage 1 with a fake model call that keeps each prompt it was sent
async function setup(reply = explored()) {
  const service = await load('anthropic');
  const prompts = [];
  const stage1 = Object.assign((req, model, d, opts) => service.stage1(req, model, d, { ...opts, call: async (_, p) => { prompts.push(p); return typeof reply === 'function' ? reply() : { text: reply, usage: {} }; } }), { fallback: service.stage1.fallback, randomness: true });
  return { handle: makeHandler(service, { stage1 }), prompts };
}

test('the tool lists keep as an optional list of strings', async () => {
  const { handle } = await setup();
  const tool = (await handle({ jsonrpc: '2.0', id: 9, method: 'tools/list' }, {})).result.tools[0];
  assert.equal(tool.inputSchema.properties.keep.type, 'array');
  assert.match(tool.inputSchema.properties.keep.description, /Leave it out when the user wants something new/);
  assert.ok(!tool.inputSchema.required.includes('keep'));
});

test('keep present: the explore step takes the items as settled and the reply starts with the Kept line', async () => {
  const { handle, prompts } = await setup();
  const out = textOf(await callTool(handle, { keep: [PALETTE, LAYOUT] }));
  assert.equal(out.split('\n')[0], `Kept: ${PALETTE}; ${LAYOUT}`);
  assert.match(out, /Settled for this request/);
  const p = prompts[0];
  assert.ok(p.indexOf(REQUEST) < p.indexOf('Already decided by the user'), 'the kept block follows the request');
  assert.ok(p.includes(`- ${PALETTE}\n- ${LAYOUT}`));
  assert.ok(p.indexOf('Already decided by the user') < p.indexOf('Stage 1'), 'and comes before the steps');
});

test('keep absent or empty: the prompt and reply are as before', async () => {
  for (const keep of [undefined, [], '']) {
    const { handle, prompts } = await setup();
    const out = textOf(await callTool(handle, keep === undefined ? {} : { keep }));
    assert.ok(!/^Kept:/m.test(out));
    assert.ok(!prompts[0].includes('Already decided'));
  }
});

test('a kept item that no longer fits is dropped, and the reply says so', async () => {
  const { handle } = await setup(explored([LAYOUT]));
  const out = textOf(await callTool(handle, { keep: [PALETTE, LAYOUT] }));
  assert.deepEqual(out.split('\n').slice(0, 2), [`Kept: ${PALETTE}`, `Dropped, as it no longer fits this request: ${LAYOUT}`]);
  // named by its <what> part only
  const { handle: h2 } = await setup(explored(['layout']));
  assert.match(textOf(await callTool(h2, { keep: [PALETTE, LAYOUT] })), /^Kept: palette = burnt orange on cream\nDropped, as it no longer fits this request: layout/);
  // all dropped
  const { handle: h3 } = await setup(explored([PALETTE]));
  assert.match(textOf(await callTool(h3, { keep: [PALETTE] })), /^Kept: nothing\nDropped/);
});

test('a pasted Kept line works the same as the list', () => {
  const want = [PALETTE, LAYOUT];
  assert.deepEqual(keepItems(`Kept: ${PALETTE}; ${LAYOUT}`), want);
  assert.deepEqual(keepItems([`Kept: ${PALETTE}; ${LAYOUT}`]), want);
  assert.deepEqual(keepItems([`${PALETTE}.`, ` - ${LAYOUT}`, PALETTE.toUpperCase()]), want);
  assert.deepEqual(keepItems(null), []);
});

test('the explore run fails: nothing settled, but the kept answers still lead the reply', async () => {
  const { handle } = await setup('no json here');
  const out = textOf(await callTool(handle, { keep: [PALETTE] }));
  assert.match(out, /^Kept: palette = burnt orange on cream\nThe random step could not run/);
});

test('a repeat call with other kept answers is a new run, the same one is not', async () => {
  const service = await load('anthropic');
  let runs = 0;
  const stage1 = Object.assign((req, model, d, opts) => service.stage1(req, model, d, { ...opts, call: async () => { runs++; return { text: explored(), usage: {} }; } }), { randomness: true });
  const handle = makeHandler(service, { stage1, repeatWindowMs: 60000 });
  await callTool(handle, { keep: [PALETTE] });
  await callTool(handle, { keep: [PALETTE] });
  assert.equal(runs, 1);
  await callTool(handle, { keep: [PALETTE, LAYOUT] });
  assert.equal(runs, 2);
});

test('no CLI (two calls): the exploring step carries the kept items and call 2 starts with the Kept line', async () => {
  const handle = makeHandler(await load('anthropic'), { inContext });
  const one = textOf(await callTool(handle, { keep: [PALETTE, LAYOUT] }));
  assert.ok(one.includes(`- ${PALETTE}\n- ${LAYOUT}`));
  const id = one.match(/\(id ([\w-]+)\)/)[1];
  const two = textOf(await callTool(handle, { id, explored: explored([LAYOUT]) }, 2));
  assert.match(two, /^Kept: palette = burnt orange on cream\nDropped, as it no longer fits this request: layout = split screen, text left\nModel Salt, step 2 of 2/);
});
