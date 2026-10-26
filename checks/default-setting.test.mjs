// Setting 1 is the default: a call that leaves the randomness out reaches the
// steps as 1, and one that sets it keeps its own value. The steps are a fake that records what it gets: no model, no network.
// usage: node --test checks/default-setting.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHandler } from '../src/server.mjs';
import { load } from '../src/services.mjs';

const call = async (args) => {
  const got = [];
  const stage1 = async (request, model, draw, opts) => { got.push(opts); return { ok: true, text: 'settled', calls: [] }; };
  const handle = makeHandler(await load('anthropic'), { stage1 });
  await handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'model_salt', arguments: { model: 'claude-opus-5-5', request: 'Write a haiku about autumn.', ...args } } }, {});
  return got[0];
};

test('left out, the setting is 1', async () => assert.equal((await call({})).randomness, 1));
test('a setting the caller gives is kept, 0 included', async () => {
  assert.equal((await call({ randomness: 0 })).randomness, 0);
  assert.equal((await call({ randomness: 1.5 })).randomness, 1.5);
});
test('the listing says so', async () => {
  const handle = makeHandler(await load('anthropic'));
  const r = await handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, {});
  assert.match(r.result.tools[0].inputSchema.properties.randomness.description, /Left out it is 1, the default/);
});
