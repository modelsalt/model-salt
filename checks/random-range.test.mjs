// node --test checks/: the live steps of every service keep two rules.
//   1. Every random number spans at least 1,000,000 values (a million options for each). Each draw the live
//      stage 1 makes is recorded: a draw that is not a word from the word list must have a range of 1,000,000 or more.
//   2. No stage text names pictures or drawing (the stages stay generic, for every kind of request).
// The model call is a fake, so this runs in a second with no model and no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { existsSync } from 'node:fs';
import WORDS from '../src/wordlist.mjs';
import { SERVICES } from '../src/services.mjs';
import { NUMBER_STEPS, MIN_NUMBER_RANGE, names, drawValues } from '../src/placeholders.mjs';

const MODELS = { anthropic: 'claude-opus-5-5', openai: 'gpt-6.1-sol' };
const FAKE = '```json\n' + JSON.stringify({ questions: [1, 2, 3, 4, 5].map((n) => ({ q: `Question ${n}?`, answers: ['a', 'b', 'c', 'd', 'e'] })), picks: [1, 2, 3, 4, 5] }) + '\n```';
const PICTURE = /\b(view|viewer|viewpoint|vantage point|perspective|camera|angle|image|picture|drawing|draw|drawn|svg|visual|pose|posed|composition|colou?r|palette|render|canvas|scene|frame|pixel|illustration|lens|photo|side-on|sideways|eye-level|where the audience stands)\b/i;

function recorder() {
  const ranges = [];
  return { ranges, draw: { below: async (n) => { ranges.push(n); return randomInt(n); }, from: 'test' } };
}

test('the placeholder number spans at least a million values', () => {
  assert.ok(NUMBER_STEPS >= MIN_NUMBER_RANGE && MIN_NUMBER_RANGE >= 1000000);
});

test('the explorer fill: every <number_NN> is drawn from at least a million values, the same name gets the same value', async () => {
  const { ranges, draw } = recorder();
  const v = await drawValues(names('<number_01> <word_01> <number_02> <number_01>'), draw.below);
  assert.deepEqual(Object.keys(v), ['number_01', 'word_01', 'number_02']);
  assert.match(v.number_01, /^[01]\.\d{6}$/);
  for (const n of ranges) assert.ok(n === WORDS.length || n >= MIN_NUMBER_RANGE, `a number drawn from only ${n} values`);
});

for (const [id, service] of Object.entries(SERVICES)) {
  test(`${id} ${service.version}: every random number in stage 1 spans at least a million values`, async () => {
    const { ranges, draw } = recorder();
    let prompt = '';
    const r = await service.stage1('Write a short story about a lighthouse keeper.', MODELS[id], draw, { call: async (m, p) => { prompt = p; return { text: FAKE, usage: {} }; } });
    assert.ok(r.ok, r.why);
    assert.ok(ranges.length > 0, 'stage 1 drew nothing');
    for (const n of ranges) assert.ok(n === WORDS.length || n >= MIN_NUMBER_RANGE, `a random number drawn from only ${n} values`);
    assert.doesNotMatch(prompt, /\b1 (to|-) 100\b|\b1-100\b|\bfrom 1 to\b/, 'the prompt names a small number range');
    assert.doesNotMatch(prompt + r.text, /<(word|number)_\d+>|\{\{[A-Z0-9_ ]+\}\}/, 'a placeholder was left unfilled');
  });

  test(`${id} ${service.version}: no picture or drawing words in any stage text`, () => {
    const t = service.templates;
    assert.ok(t, `${id}: the live steps have no templates (src/template-steps.mjs)`);
    for (const k of ['stage1', 'line', 'reply']) {
      const m = String(t[k]).match(PICTURE);
      assert.equal(m, null, `${id} ${k}: "${m && m[0]}"`);
    }
  });
}

// 3. The randomness setting changes no stage text, leaves a call without it exactly as before, and every number it
//    draws itself spans at least 1,000,000 values.
import { shares, temper, repick } from '../src/template-steps.mjs';

const WITH_SHARES = [1, 2, 3, 4, 5].map((n) => `Q${n}: Question ${n}?\n` + [50, 20, 15, 10, 5].map((s, i) => `w${i}, A${i + 1}: answer ${n}${i} [${s}%]`).join('\n')).join('\n\n')
  + '\n\n```json\n' + JSON.stringify({ questions: [1, 2, 3, 4, 5].map((n) => ({ q: `Question ${n}?`, answers: [0, 1, 2, 3, 4].map((i) => `answer ${n}${i}`) })), picks: [2, 2, 3, 4, 5] }) + '\n```';

test('randomness: the shares are read from the answer lines, and the dial runs from the usual answer to flat', () => {
  const p = shares(WITH_SHARES, JSON.parse(WITH_SHARES.split('```json\n')[1].split('\n```')[0]));
  assert.equal(p.length, 5);
  assert.deepEqual(p[0].map((x) => +x.toFixed(2)), [0.5, 0.2, 0.15, 0.1, 0.05]);
  assert.deepEqual(temper(p[0], 0), [1, 0, 0, 0, 0]);
  assert.deepEqual(temper(p[0], 2), [0.2, 0.2, 0.2, 0.2, 0.2]);
  assert.deepEqual(temper(p[0], 1).map((x) => +x.toFixed(6)), p[0].map((x) => +x.toFixed(6)));
  assert.ok(temper(p[0], 0.5)[0] > p[0][0] && temper(p[0], 1.5)[0] < p[0][0]);
});

for (const [id, service] of Object.entries(SERVICES)) {
  test(`${id} ${service.version}: the randomness setting left out or at 1 gives the same reply`, async () => {
    const values = await drawValues(names(service.templates.stage1, service.templates.line, service.templates.reply), recorder().draw.below);
    const run = async (opts) => {
      const { ranges, draw } = recorder();
      let prompt = '';
      const r = await service.stage1('Write a short story about a lighthouse keeper.', MODELS[id], draw, { ...opts, values, call: async (m, p) => { prompt = p; return { text: WITH_SHARES, usage: {} }; } });
      return { r, prompt, ranges };
    };
    const base = await run({}), one = await run({ randomness: 1 }), zero = await run({ randomness: 0 }), two = await run({ randomness: 2 });
    assert.equal(service.stage1.randomness, true);
    assert.equal(one.r.text, base.r.text);
    assert.deepEqual(base.r.picks, [1, 1, 2, 3, 4]);
    assert.ok(zero.prompt !== base.prompt && two.prompt !== base.prompt, 'the setting should change the question count');
    // at 0 every pick is the usual answer, or the model's own pick where its number already fell on the usual answer's span (the
    // fake's picks stand for clash moves)
    zero.r.picks.forEach((p, i) => assert.ok(p === 0 || p === base.r.picks[i], `question ${i + 1}: answer ${p + 1} at randomness 0`));
    for (const x of [base, one, zero, two]) for (const n of x.ranges) assert.ok(n === WORDS.length || n >= MIN_NUMBER_RANGE, `a number drawn from only ${n} values`);
  });

  test(`${id} ${service.version}: the randomness argument names no pictures`, async () => {
    const { makeHandler } = await import('../src/server.mjs');
    const h = makeHandler(service);
    const list = await h({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const arg = list.result.tools[0].inputSchema.properties.randomness;
    assert.ok(arg && arg.minimum === 0 && arg.maximum === 2);
    assert.equal(String(arg.description).match(PICTURE), null);
  });
}

test('randomness: a template without one number per question draws fresh numbers of at least a million values', async () => {
  const { ranges, draw } = recorder();
  const j = JSON.parse(WITH_SHARES.split('```json\n')[1].split('\n```')[0]);
  const r = await repick({ stage1: 'no numbers here' }, {}, WITH_SHARES, j, 1.5, draw.below);
  assert.equal(r.numbers.length, 5);
  assert.equal(ranges.length, 5);
  for (const n of ranges) assert.ok(n >= MIN_NUMBER_RANGE, `a number drawn from only ${n} values`);
});

// the earlier steps file is in the development repo only, so this check skips where it is missing
const HAS_044B = existsSync(new URL('../services/anthropic/steps/0.44b.mjs', import.meta.url));
test('the randomness steps 0.45a keep the live 0.44b texts word for word (0.44a renamed to Model Salt)', { skip: !HAS_044B && 'no 0.44b here' }, async () => {
  for (const fam of ['anthropic', 'openai']) {
    const a = await import(`../services/${fam}/steps/0.44b.mjs`), b = await import(`../services/${fam}/steps/0.45a.mjs`);
    for (const k of ['STAGE1', 'LINE', 'REPLY', 'description', 'instructions', 'FALLBACK']) assert.equal(b[k], a[k], `${fam} ${k}`);
  }
});

// 4. The question count (r38): the setting sets how many questions stage 1 asks; only the count parts of the text change, every
//    setting's text has no picture word, and every number it draws spans at least 1,000,000 values.
import { countFor, withCount } from '../src/template-steps.mjs';

test('randomness: the question count runs 1, 3, 5, 8, 10 over 0, 0.5, 1, 1.5, 2', () => {
  assert.deepEqual([0, 0.5, 1, 1.5, 2].map(countFor), [1, 3, 5, 8, 10]);
  assert.equal(countFor(undefined), 5);
  assert.equal(countFor(7), 10);
});

for (const [id, service] of Object.entries(SERVICES)) {
  test(`${id} ${service.version}: each setting asks its count of questions, with one word line and one number per question`, async () => {
    const t = service.templates;
    assert.equal(withCount(t.stage1, 5), t.stage1, 'five questions must be the text as it is');
    for (const r of [0, 0.5, 1, 1.5, 2]) {
      const n = countFor(r), { ranges, draw } = recorder();
      let prompt = '';
      const fake = '```json\n' + JSON.stringify({ questions: Array.from({ length: n }, (_, k) => ({ q: `Question ${k + 1}?`, answers: ['a', 'b', 'c', 'd', 'e'] })), picks: Array(n).fill(1) }) + '\n```';
      const out = await service.stage1('Write a short story about a lighthouse keeper.', MODELS[id], draw, { randomness: r, call: async (m, p) => { prompt = p; return { text: fake, usage: {} }; } });
      assert.ok(out.ok, out.why);
      const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n];
      assert.match(prompt, new RegExp(`\\b${words} structural question${n > 1 ? 's' : ''}\\b`), `randomness ${r}: the count`);
      assert.equal(prompt.match(/^D\d+: "/gm).length, n, `randomness ${r}: decision lines`);
      assert.equal(prompt.match(/^Q\d+: "[^"]+", "[^"]+", "[^"]+", "[^"]+", "[^"]+"$/gm).length, n, `randomness ${r}: answer word lines`);
      assert.equal(prompt.match(/^Q\d+: [01]\.\d{6}$/gm).length, n, `randomness ${r}: number lines`);
      assert.doesNotMatch(prompt, /<(word|number)_\d+>|\{\{[A-Z0-9_ ]+\}\}/, `randomness ${r}: a placeholder left unfilled`);
      for (const k of ranges) assert.ok(k === WORDS.length || k >= MIN_NUMBER_RANGE, `randomness ${r}: a number drawn from only ${k} values`);
      const text = withCount(t.stage1, n), m = text.match(PICTURE);
      assert.equal(m, null, `randomness ${r}: "${m && m[0]}"`);
      // outside the count parts the text is v1's word for word
      const strip = (x) => x.replace(/^(D|Q)\d+: .*$/gm, '').replace(/\b\w+ structural questions?\b/, '').replace(/\(D1( to D\d+)?\)/, '').replace(/\], "picks".*$/m, '').replace(/, \.\.\.\w+ questions?$/m, '').replace(/\n+/g, '\n');
      assert.equal(strip(text).replace(/, \.\.\.\w+ questions/, ''), strip(t.stage1).replace(/, \.\.\.\w+ questions/, ''), `randomness ${r}: words outside the count changed`);
    }
  });
}

test('randomness: shares are read from answer lines without their A labels too', () => {
  const text = 'Q1: Which?\n- **w1:** first [40%]\n- **w2:** second [15%]\n- **w3:** third [10%]\n- **w4:** fourth [25%]\n- **w5:** fifth [10%]\n\nQ1: 4, because 0.693045 falls between [0.65, 0.90].';
  const p = shares(text, { questions: [{ q: 'Which?', answers: ['first', 'second', 'third', 'fourth', 'fifth'] }] });
  assert.deepEqual(p[0].map((x) => +x.toFixed(2)), [0.4, 0.15, 0.1, 0.25, 0.1]);
});

for (const [id, service] of Object.entries(SERVICES)) {
  test(`${id} ${service.version}: a fixed count of five keeps the v1 text at every setting`, async () => {
    for (const r of [0, 2]) {
      let prompt = '', base = '';
      const values = await drawValues(names(service.templates.stage1), recorder().draw.below);
      await service.stage1('Write a short story about a lighthouse keeper.', MODELS[id], recorder().draw, { values, randomness: r, count: 5, call: async (m, p) => { prompt = p; return { text: WITH_SHARES, usage: {} }; } });
      await service.stage1('Write a short story about a lighthouse keeper.', MODELS[id], recorder().draw, { values, call: async (m, p) => { base = p; return { text: WITH_SHARES, usage: {} }; } });
      assert.equal(prompt, base, `randomness ${r} with count 5`);
    }
  });
}

// 5. The answer count (r39): with dial 'answers' the setting sets the answers per question, five questions throughout; only the answer
//    parts change, no picture word, numbers of at least 1,000,000 values.
import { answersFor, withAnswers } from '../src/template-steps.mjs';

test('randomness: the answers per question run 2, 3, 5, 8, 10 over 0, 0.5, 1, 1.5, 2', () => {
  assert.deepEqual([0, 0.5, 1, 1.5, 2].map(answersFor), [2, 3, 5, 8, 10]);
  assert.equal(answersFor(undefined), 5);
});

for (const [id, service] of Object.entries(SERVICES)) {
  test(`${id} ${service.version}: with dial 'answers' each setting offers its count of answers to each of five questions`, async () => {
    const t = service.templates;
    assert.equal(withAnswers(t.stage1, 5), t.stage1);
    for (const r of [0, 0.5, 1, 1.5, 2]) {
      const a = answersFor(r), { ranges, draw } = recorder();
      let prompt = '';
      const fake = '```json\n' + JSON.stringify({ questions: [1, 2, 3, 4, 5].map((k) => ({ q: `Question ${k}?`, answers: Array.from({ length: a }, (_, i) => `a${i}`) })), picks: Array(5).fill(1) }) + '\n```';
      const out = await service.stage1('Write a short story about a lighthouse keeper.', MODELS[id], draw, { randomness: r, dial: 'answers', call: async (m, p) => { prompt = p; return { text: fake, usage: {} }; } });
      assert.ok(out.ok, out.why);
      const w = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][a];
      assert.match(prompt, /\bfive structural questions\b/);
      assert.match(prompt, new RegExp(`and ${w} answers to each`), `randomness ${r}: the count`);
      const lines = prompt.match(/^Q\d: "[^"]+"(, "[^"]+")*$/gm);
      assert.equal(lines.length, 5, `randomness ${r}: answer word lines`);
      for (const l of lines) assert.equal(l.split('", "').length, a, `randomness ${r}: words per line`);
      assert.equal(prompt.match(/^Q\d: [01]\.\d{6}$/gm).length, 5);
      assert.doesNotMatch(prompt, /<(word|number)_\d+>|\{\{[A-Z0-9_ ]+\}\}/);
      for (const k of ranges) assert.ok(k === WORDS.length || k >= MIN_NUMBER_RANGE, `randomness ${r}: a number drawn from only ${k} values`);
      const text = withAnswers(t.stage1, a), m = text.match(PICTURE);
      assert.equal(m, null, `randomness ${r}: "${m && m[0]}"`);
      const strip = (x) => x.replace(/^Q\d: ".*$/gm, '').replace(/and \w+ answers to each/, '').replace(/the \w+ shares add up/, '').replace(/^<word>, A\d+: .*$/gm, '').replace(/^\{"questions".*$/m, '');
      assert.equal(strip(text), strip(t.stage1), `randomness ${r}: words outside the answer count changed`);
    }
  });
}

// 6. Both counts (r41): with dial 'both' the setting sets the questions (3, 4, 5, 7, 9) and the answers per question (2, 3, 5, 8, 10)
//    together; only the count parts change, no picture word, numbers of at least 1,000,000 values.
import { bothQuestionsFor, withShape } from '../src/template-steps.mjs';

test('randomness: with both counts the questions run 3, 4, 5, 7, 9 over 0, 0.5, 1, 1.5, 2', () => {
  assert.deepEqual([0, 0.5, 1, 1.5, 2].map(bothQuestionsFor), [3, 4, 5, 7, 9]);
  assert.equal(bothQuestionsFor(undefined), 5);
});

for (const [id, service] of Object.entries(SERVICES)) {
  test(`${id} ${service.version}: with dial 'both' each setting asks its questions with its answers each`, async () => {
    const t = service.templates;
    assert.equal(withShape(t.stage1, 5, 5), t.stage1);
    for (const r of [0, 0.5, 1, 1.5, 2]) {
      const n = bothQuestionsFor(r), a = answersFor(r), { ranges, draw } = recorder();
      let prompt = '';
      const fake = '```json\n' + JSON.stringify({ questions: Array.from({ length: n }, (_, k) => ({ q: `Question ${k}?`, answers: Array.from({ length: a }, (_, i) => `a${i}`) })), picks: Array(n).fill(1) }) + '\n```';
      const out = await service.stage1('Write a short story about a lighthouse keeper.', MODELS[id], draw, { randomness: r, dial: 'both', call: async (m, p) => { prompt = p; return { text: fake, usage: {} }; } });
      assert.ok(out.ok, out.why);
      const w = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
      assert.match(prompt, new RegExp(`\\b${w[n]} structural questions\\b`), `randomness ${r}: the question count`);
      assert.match(prompt, new RegExp(`and ${w[a]} answers to each`), `randomness ${r}: the answer count`);
      const lines = prompt.match(/^Q\d: "[^"]+"(, "[^"]+")*$/gm);
      assert.equal(lines.length, n, `randomness ${r}: answer word lines`);
      for (const l of lines) assert.equal(l.split('", "').length, a, `randomness ${r}: words per line`);
      assert.equal(prompt.match(/^D\d: "[^"]+"$/gm).length, n, `randomness ${r}: decision lines`);
      assert.equal(prompt.match(/^Q\d: [01]\.\d{6}$/gm).length, n, `randomness ${r}: number lines`);
      assert.doesNotMatch(prompt, /<(word|number)_\d+>|\{\{[A-Z0-9_ ]+\}\}/);
      for (const k of ranges) assert.ok(k === WORDS.length || k >= MIN_NUMBER_RANGE, `randomness ${r}: a number drawn from only ${k} values`);
      const text = withShape(t.stage1, n, a), m = text.match(PICTURE);
      assert.equal(m, null, `randomness ${r}: "${m && m[0]}"`);
      const strip = (x) => x.replace(/^[DQ]\d: .*$/gm, '').replace(/\b\w+ structural questions?\b/, '').replace(/\(D1( to D\d+)?\)/, '').replace(/and \w+ answers to each/, '').replace(/the \w+ shares add up/, '').replace(/^<word>, A\d+: .*$/gm, '').replace(/^\{"questions".*$/m, '').split('\n').filter((l) => l.trim()).join('\n');
      assert.equal(strip(text), strip(t.stage1), `randomness ${r}: words outside the counts changed`);
    }
  });
}

// 7. The curve (r43): questions 3, 4, 5, 5, 6 and answers 2, 3, 5, 8, 10; each question's shares are tempered to a set chance of the
//    usual answer (100%, 70%, 45%, 25%, even); only the count parts of the text change, no picture word, numbers of at least 1,000,000.
import { curveQuestionsFor, usualTarget, temperTo } from '../src/template-steps.mjs';

test('randomness: the curve asks 3, 4, 5, 5, 6 questions and keeps the usual answer 100%, 70%, 45%, 25%, even', () => {
  assert.deepEqual([0, 0.5, 1, 1.5, 2].map(curveQuestionsFor), [3, 4, 5, 5, 6]);
  assert.deepEqual([0, 0.5, 1, 1.5, 2].map((r) => +usualTarget(r, answersFor(r)).toFixed(4)), [1, 0.7, 0.45, 0.25, 0.1]);
  assert.deepEqual(temperTo([0.5, 0.5], 0.95), [1, 0]); // a tie cannot reach the target by weighting: the usual answer only
  for (const p of [[0.9, 0.05, 0.03, 0.02], [0.3, 0.25, 0.25, 0.2], [0.6, 0.4]]) {
    for (const target of [0.95, 0.7, 0.45, 0.3]) {
      const q = temperTo(p, Math.max(target, 1 / p.length)), top = p.indexOf(Math.max(...p));
      assert.ok(Math.abs(q[top] - Math.max(target, 1 / p.length)) < 1e-6, `${p} at ${target}: ${q[top]}`);
      assert.ok(Math.abs(q.reduce((a, b) => a + b, 0) - 1) < 1e-9);
    }
  }
});

test('randomness: with the curve a setting of 1 is a point on it, and a missing setting keeps the model\'s own picks', async () => {
  const j = { questions: [{ q: 'Q?', answers: ['a', 'b', 'c', 'd', 'e'] }], picks: [1] };
  const text = 'w, A1: a [90%]\nw, A2: b [4%]\nw, A3: c [3%]\nw, A4: d [2%]\nw, A5: e [1%]';
  const t = { stage1: 'Q1: <number_01>' }, below = async () => 0;
  assert.equal((await repick(t, { number_01: '0.95' }, text, j, undefined, below, true)).j, j);
  const r = await repick(t, { number_01: '0.95' }, text, j, 1, below, true);
  assert.equal(r.j.picks[0], 5); // 0.95 falls past the usual answer's 45% at setting 1 on the curve; v1's own shares keep answer 1
  assert.equal((await repick(t, { number_01: '0.95' }, text, j, 1, below)).j, j);
});

for (const [id, service] of Object.entries(SERVICES)) {
  test(`${id} ${service.version}: with dial 'curve' each setting asks its questions with its answers each`, async () => {
    const t = service.templates;
    for (const r of [0, 0.5, 1, 1.5, 2]) {
      const n = curveQuestionsFor(r), a = answersFor(r), { ranges, draw } = recorder();
      let prompt = '';
      const fake = '```json\n' + JSON.stringify({ questions: Array.from({ length: n }, (_, k) => ({ q: `Question ${k}?`, answers: Array.from({ length: a }, (_, i) => `a${i}`) })), picks: Array(n).fill(1) }) + '\n```';
      const out = await service.stage1('Write a short story about a lighthouse keeper.', MODELS[id], draw, { randomness: r, dial: 'curve', call: async (m, p) => { prompt = p; return { text: fake, usage: {} }; } });
      assert.ok(out.ok, out.why);
      assert.equal(prompt.match(/^Q\d: "[^"]+"(, "[^"]+")*$/gm).length, n, `randomness ${r}: answer word lines`);
      for (const l of prompt.match(/^Q\d: "[^"]+"(, "[^"]+")*$/gm)) assert.equal(l.split('", "').length, a, `randomness ${r}: words per line`);
      assert.equal(prompt.match(/^Q\d: [01]\.\d{6}$/gm).length, n, `randomness ${r}: number lines`);
      assert.doesNotMatch(prompt, /<(word|number)_\d+>|\{\{[A-Z0-9_ ]+\}\}/);
      for (const k of ranges) assert.ok(k === WORDS.length || k >= MIN_NUMBER_RANGE, `randomness ${r}: a number drawn from only ${k} values`);
      const m = withShape(t.stage1, n, a).match(PICTURE);
      assert.equal(m, null, `randomness ${r}: "${m && m[0]}"`);
    }
  });
}
