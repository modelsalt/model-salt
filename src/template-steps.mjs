// Steps made from plain-text templates (21 Oct): the form the prompt explorer edits and exports, and the form of the live steps from
// 0.43b (Opus) and 0.42b (Sol) on. A family's pipeline is three texts:
//   stage1  the explore prompt the service sends to a fresh model run (src/runner.mjs). {{REQUEST}} is the user's request; <word_NN>
//           and <number_NN> are outside random input (src/placeholders.mjs). Its reply must end in one ```json block:
//           {"questions": [{"q": "...", "answers": ["...", ...]}, ...], "picks": [<answer number, from 1>, ...]}
//   line    one settled question, as the tool returns it: {{N}} its number, {{Q}} the question, {{A}} the chosen answer
//   reply   what the tool returns to the client: {{REQUEST}}, {{SETTLED}} (the lines), {{STAGE1_PROMPT}} and {{STAGE1_REPLY}} (the
//           explore run's exact prompt and raw reply)
// plus the tool description and server instructions the client reads. The same placeholder name has the same value in all of them
// within one run. Nothing here names any kind of request: what a template says is the template's own.
import { names, drawValues, fill, NUMBER_STEPS } from './placeholders.mjs';

const stop = (s) => { s = String(s).trim(); return s + (/[.!?]$/.test(s) ? '' : '.'); };
const slots = (text, map) => String(text).replace(/\{\{([A-Z0-9_]+)\}\}/g, (s, k) => (k in map ? String(map[k]) : s));

// the reply's last ```json block, if it holds questions with answers and one valid pick per question
export function lift(text) {
  const blocks = [...String(text || '').matchAll(/```json\s*([\s\S]*?)```/g)];
  const raw = blocks.length ? blocks[blocks.length - 1][1] : (String(text || '').match(/\{[\s\S]*\}\s*$/) || [''])[0];
  try {
    const j = JSON.parse(raw);
    const qs = j.questions;
    const ok = Array.isArray(qs) && qs.length > 0 && qs.every((q) => q && typeof q.q === 'string' && Array.isArray(q.answers) && q.answers.length > 0 && q.answers.every((a) => typeof a === 'string' && a.trim()))
      && Array.isArray(j.picks) && j.picks.length === qs.length && j.picks.every((p, i) => Number.isInteger(p) && p >= 1 && p <= qs[i].answers.length);
    return ok ? j : null;
  } catch { return null; }
}

// The randomness setting: by default a pick follows how often skilled people would choose each answer, and the setting makes it
// more or less random than that. Stage 1 writes each answer's share of skilled people ('[35%]') and picks by
// the question's outside number laid on those shares. The setting is one number, 0 to 2, and changes nothing in any stage text:
//   0  always the usual answer (the largest share)
//   1  the shares as written: the model's own picks, exactly as without the setting (the default, v1)
//   2  every answer equally likely
// In between, each share is raised to the power (2 - r) / r and the five are scaled back to add up to 1 (0.5 gives the cube, sharper;
// 1.5 the cube root, flatter). The same outside number is then laid on the new spans, so the dial moves the pick smoothly away from
// or toward the usual answer. A pick the model moved off its span for a clash is kept while the new span gives the same answer.
export const RANDOMNESS = { min: 0, max: 2, default: 1 };

// The question count (tried in round r38): the setting also sets how many structural questions stage 1 asks: 1 at 0, five at 1 (v1, the text as it
// is), 10 at 2, in even steps on each side (0.5 asks 3, 1.5 asks 8). Only the count changes: "five structural questions" becomes the
// new number, and the D lines, the Q lines of answer words, the Q lines of numbers and the JSON template get one line per question.
// Every other word of the text stays. A text without those parts (an explorer edit) keeps its own count.
export const countFor = (r) => {
  r = r === undefined || r === null || r === '' || !Number.isFinite(Number(r)) ? RANDOMNESS.default : Math.min(RANDOMNESS.max, Math.max(RANDOMNESS.min, Number(r)));
  return r <= 1 ? Math.round(1 + 4 * r) : Math.round(5 + 5 * (r - 1));
};
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const pad = (k) => String(k).padStart(2, '0');
const COUNT_PARTS = {
  ask: /\bfive structural questions\b/,
  range: '(D1 to D5)',
  decisions: /^D1: "<word_01>"\nD2: "<word_02>"\nD3: "<word_03>"\nD4: "<word_04>"\nD5: "<word_05>"$/m,
  words: /^Q1: "<word_06>", "<word_07>", "<word_08>", "<word_09>", "<word_10>"\n(?:Q\d: (?:"<word_\d\d>"(?:, )?){5}\n){3}Q5: "<word_26>", "<word_27>", "<word_28>", "<word_29>", "<word_30>"$/m,
  numbers: /^Q1: <number_01>\nQ2: <number_02>\nQ3: <number_03>\nQ4: <number_04>\nQ5: <number_05>$/m,
  json: ', ...five questions], "picks": [<the number, 1 to 5, of the answer chosen for Q1>, ...five numbers]}',
};
// withCount(text, n): the stage 1 text asking n questions; n of 5, or a text without the parts above, comes back as it is
export function withCount(text, n) {
  const s = String(text);
  const has = Object.values(COUNT_PARTS).every((x) => (typeof x === 'string' ? s.includes(x) : x.test(s)));
  if (n === 5 || !has || !(n >= 1 && n <= 10)) return s;
  const lines = (f) => Array.from({ length: n }, (_, i) => f(i + 1)).join('\n');
  const nouns = (w) => `${NUMBER_WORDS[n]} ${w}${n > 1 ? 's' : ''}`;
  return s
    .replace(COUNT_PARTS.ask, nouns('structural question'))
    .replace(COUNT_PARTS.range, n > 1 ? `(D1 to D${n})` : '(D1)')
    .replace(COUNT_PARTS.decisions, lines((i) => `D${i}: "<word_${pad(i)}>"`))
    .replace(COUNT_PARTS.words, lines((i) => `Q${i}: ` + [1, 2, 3, 4, 5].map((k) => `"<word_${pad(n + 5 * (i - 1) + k)}>"`).join(', ')))
    .replace(COUNT_PARTS.numbers, lines((i) => `Q${i}: <number_${pad(i)}>`))
    .replace(COUNT_PARTS.json, n > 1 ? `, ...${nouns('question')}], "picks": [<the number, 1 to 5, of the answer chosen for Q1>, ...${nouns('number')}]}` : '], "picks": [<the number, 1 to 5, of the answer chosen for Q1>]}');
}

// The answer count (tried in round r39): the dial sets how many answers each of the five questions offers: 2 at 0, 3 at 0.5, five at 1 (v1, the text as it
// is), 8 at 1.5, 10 at 2, in straight steps between. Only the answer count changes: "five answers to each" and "the five shares", the
// answer-word lines, the output template's last answer line and the JSON template. At 0 it is 2, not 1: one answer leaves nothing
// to choose and drops the share. A text without those parts keeps its own count.
const ANSWER_STEPS = [[0, 2], [0.5, 3], [1, 5], [1.5, 8], [2, 10]];
export const answersFor = (r) => {
  r = r === undefined || r === null || r === '' || !Number.isFinite(Number(r)) ? RANDOMNESS.default : Math.min(RANDOMNESS.max, Math.max(RANDOMNESS.min, Number(r)));
  for (let i = 1; i < ANSWER_STEPS.length; i++) {
    const [x0, y0] = ANSWER_STEPS[i - 1], [x1, y1] = ANSWER_STEPS[i];
    if (r <= x1) return Math.round(y0 + ((r - x0) / (x1 - x0)) * (y1 - y0));
  }
  return 10;
};
const ANSWER_PARTS = {
  each: 'and five answers to each',
  shares: 'the five shares add up to 100%',
  words: COUNT_PARTS.words,
  last: '<word>, A5: <answer> [<share>%]',
  json: '"answers": ["<answer 1>", "<answer 2>", "<answer 3>", "<answer 4>", "<answer 5>"]',
  pick: '<the number, 1 to 5, of the answer chosen for Q1>',
};
// withAnswers(text, a): the five-question stage 1 text with a answers per question; a of 5, or a text without the parts above, comes
// back as it is
export function withAnswers(text, a) {
  const s = String(text);
  const has = Object.values(ANSWER_PARTS).every((x) => (typeof x === 'string' ? s.includes(x) : x.test(s)));
  if (a === 5 || !has || !(a >= 2 && a <= 10)) return s;
  const w = NUMBER_WORDS[a];
  return s
    .replace(ANSWER_PARTS.each, `and ${w} answers to each`)
    .replace(ANSWER_PARTS.shares, `the ${w} shares add up to 100%`)
    .replace(ANSWER_PARTS.words, [1, 2, 3, 4, 5].map((i) => `Q${i}: ` + Array.from({ length: a }, (_, k) => `"<word_${pad(5 + a * (i - 1) + k + 1)}>"`).join(', ')).join('\n'))
    .replace(ANSWER_PARTS.last, `<word>, A${a}: <answer> [<share>%]`)
    .replace(ANSWER_PARTS.json, `"answers": [${Array.from({ length: a }, (_, k) => `"<answer ${k + 1}>"`).join(', ')}]`)
    .replace(ANSWER_PARTS.pick, `<the number, 1 to ${a}, of the answer chosen for Q1>`);
}

// Both counts (tried in round r41): the dial sets the questions and the answers per question together:
// questions 3 / 4 / 5 / 7 / 9 and answers 2 / 3 / 5 / 8 / 10 at 0 / 0.5 / 1 / 1.5 / 2, straight steps between; 1 is v1 (five and five).
// The question ladder is gentler than r38's 1-10: at 1 question the view question never came up, and at 8-10 fit fell to 3.5-3.6 with
// the most slips, so it stays at 3 or more and stops at 9. Only the count parts of the text change, as in withCount and withAnswers.
const BOTH_QUESTIONS = [[0, 3], [0.5, 4], [1, 5], [1.5, 7], [2, 9]];
export const bothQuestionsFor = (r) => {
  r = r === undefined || r === null || r === '' || !Number.isFinite(Number(r)) ? RANDOMNESS.default : Math.min(RANDOMNESS.max, Math.max(RANDOMNESS.min, Number(r)));
  for (let i = 1; i < BOTH_QUESTIONS.length; i++) {
    const [x0, y0] = BOTH_QUESTIONS[i - 1], [x1, y1] = BOTH_QUESTIONS[i];
    if (r <= x1) return Math.round(y0 + ((r - x0) / (x1 - x0)) * (y1 - y0));
  }
  return 9;
};
// withShape(text, n, a): the stage 1 text with n questions of a answers each; 5 and 5, or a text without the parts, comes back as it is
export function withShape(text, n, a) {
  const s = String(text);
  const has = [...Object.values(COUNT_PARTS), ...Object.values(ANSWER_PARTS)].every((x) => (typeof x === 'string' ? s.includes(x) : x.test(s)));
  if ((n === 5 && a === 5) || !has || !(n >= 1 && n <= 10) || !(a >= 2 && a <= 10)) return s;
  const lines = (f) => Array.from({ length: n }, (_, i) => f(i + 1)).join('\n');
  const nouns = (w) => `${NUMBER_WORDS[n]} ${w}${n > 1 ? 's' : ''}`, pick = `<the number, 1 to ${a}, of the answer chosen for Q1>`;
  return s
    .replace(COUNT_PARTS.ask, nouns('structural question'))
    .replace(COUNT_PARTS.range, n > 1 ? `(D1 to D${n})` : '(D1)')
    .replace(COUNT_PARTS.decisions, lines((i) => `D${i}: "<word_${pad(i)}>"`))
    .replace(COUNT_PARTS.words, lines((i) => `Q${i}: ` + Array.from({ length: a }, (_, k) => `"<word_${pad(n + a * (i - 1) + k + 1)}>"`).join(', ')))
    .replace(COUNT_PARTS.numbers, lines((i) => `Q${i}: <number_${pad(i)}>`))
    .replace(COUNT_PARTS.json, n > 1 ? `, ...${nouns('question')}], "picks": [${pick}, ...${nouns('number')}]}` : `], "picks": [${pick}]}`)
    .replace(ANSWER_PARTS.each, `and ${NUMBER_WORDS[a]} answers to each`)
    .replace(ANSWER_PARTS.shares, `the ${NUMBER_WORDS[a]} shares add up to 100%`)
    .replace(ANSWER_PARTS.last, `<word>, A${a}: <answer> [<share>%]`)
    .replace(ANSWER_PARTS.json, `"answers": [${Array.from({ length: a }, (_, k) => `"<answer ${k + 1}>"`).join(', ')}]`);
}

// The curve (round r43, used by 1.0.0): with a plain power, settings 0 to 1 looked alike and only 1.5 and up felt random. Why: the models write most of the share on the
// habitual answer (side-on), so the power (2 - r) / r kept it at about 90% at 0.5 and 40-67% at 1. The curve sets the outcome
// instead: each setting has a target chance of keeping the usual answer, and each question's shares are raised to the power that
// gives exactly that chance, whatever the model wrote. Targets 100% / 70% / 45% / 25% / even (1 in the answer count) at
// 0 / 0.5 / 1 / 1.5 / 2, straight between. The ends are as before: 0 always the usual answer, 2 every answer equally likely.
// The counts: answers 2 / 3 / 5 / 8 / 10 as in r39-r42; questions 3 / 4 / 5 / 5 / 6. In r41 and r42 the top had 7-9 questions and fit
// fell to 2.3-3.7: every question the setting moves takes its new answer without the model's clash check, so more moved questions
// make more clashes ("stopped, one foot on the ground" with "animated bobbing"; "distant, small" with "every feather"). Five
// questions held fit at 3.9 at the top (r37, r39), so the count stops at 6.
export const USUAL_TARGET = [[0, 1], [0.5, 0.7], [1, 0.45], [1.5, 0.25], [2, 0]];
const CURVE_QUESTIONS = [[0, 3], [0.5, 4], [1, 5], [1.5, 5], [2, 6]];
const along = (steps, r) => {
  for (let i = 1; i < steps.length; i++) {
    const [x0, y0] = steps[i - 1], [x1, y1] = steps[i];
    if (r <= x1) return y0 + ((r - x0) / (x1 - x0)) * (y1 - y0);
  }
  return steps[steps.length - 1][1];
};
const clampR = (r) => (r === undefined || r === null || r === '' || !Number.isFinite(Number(r)) ? RANDOMNESS.default : Math.min(RANDOMNESS.max, Math.max(RANDOMNESS.min, Number(r))));
export const curveQuestionsFor = (r) => Math.round(along(CURVE_QUESTIONS, clampR(r)));
// the target chance of the usual answer at r for a question of n answers: never below even (1 / n)
export const usualTarget = (r, n) => Math.max(1 / n, along(USUAL_TARGET, clampR(r)));
// temperTo(p, target): p raised to the power that gives its largest share exactly target (0 = even, large = the usual answer only)
export function temperTo(p, target) {
  const top = p.indexOf(Math.max(...p)), at = (k) => { const w = p.map((x) => (x > 0 ? x ** k : 0)), t = w.reduce((a, b) => a + b, 0); return w.map((x) => x / t); };
  if (target <= 1 / p.length + 1e-9) return p.map(() => 1 / p.length);
  if (target >= 1 - 1e-9 || at(64)[top] < target) return p.map((_, i) => (i === top ? 1 : 0));
  let lo = 0, hi = 64;
  for (let n = 0; n < 60; n++) { const k = (lo + hi) / 2; if (at(k)[top] < target) lo = k; else hi = k; }
  return at((lo + hi) / 2);
}

// shares(text, j): each question's shares, as fractions of 1, from the answer lines of stage 1's reply ('<word>, A1: <answer> [35%]'),
// or null when they are not all there
export function shares(text, j) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const m = line.match(/\bA(\d+)\s*:.*\[\s*(\d+(?:\.\d+)?)\s*%\s*\]\s*$/);
    if (!m) continue;
    if (m[1] === '1') out.push([]);
    if (out.length) out[out.length - 1].push(Number(m[2]));
  }
  const bad = (o) => o.length !== j.questions.length || o.some((s, i) => s.length !== j.questions[i].answers.length || !(s.reduce((a, b) => a + b, 0) > 0));
  if (bad(out)) {
    // the answer lines without their 'A1:' labels (r38: a one-question reply wrote '- **word:** answer [40%]'): every line that ends in
    // a share, in order, when there is exactly one per answer
    const flat = [...String(text || '').matchAll(/\[\s*(\d+(?:\.\d+)?)\s*%\s*\]\**\s*$/gm)].map((m) => Number(m[1]));
    if (flat.length !== j.questions.reduce((a, q) => a + q.answers.length, 0)) return null;
    out.length = 0;
    for (const q of j.questions) out.push(flat.splice(0, q.answers.length));
    if (bad(out)) return null;
  }
  return out.map((s) => { const t = s.reduce((a, b) => a + b, 0); return s.map((x) => x / t); });
}

// temper(p, r): the shares p (adding up to 1) at randomness r
export function temper(p, r) {
  if (r >= 2) return p.map(() => 1 / p.length);
  if (r <= 0) { const top = p.indexOf(Math.max(...p)); return p.map((_, i) => (i === top ? 1 : 0)); }
  const k = (2 - r) / r, w = p.map((x) => (x > 0 ? x ** k : 0)), t = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / t);
}

// the answer (from 0) whose span holds x when the shares p are laid end to end
export const span = (p, x) => { let edge = 0; for (let i = 0; i < p.length; i++) { edge += p[i]; if (x < edge) return i; } return p.length - 1; };

// repick(t, values, text, j, r, below): j with its picks at randomness r, plus how each was reached. r of 1 (or none) returns j as it
// is. Question n's number is the n-th <number_NN> of stage 1 when the template has one per question, else a fresh draw of
// NUMBER_STEPS (1,000,001) values from the outside draw.
export async function repick(t, values, text, j, r, below, curve = false) {
  // with the curve (r43) 1 is a point on it too; only a missing setting keeps the model's own picks
  if (r === undefined || r === null || r === '' || !Number.isFinite(Number(r)) || (!curve && Number(r) === RANDOMNESS.default)) return { j };
  r = Math.min(RANDOMNESS.max, Math.max(RANDOMNESS.min, Number(r)));
  const p = shares(text, j);
  if (!p) return { j, how: 'no shares in the reply: the picks as written' };
  const nums = names(t.stage1).filter((k) => k.startsWith('number_')).map((k) => Number(values[k]));
  const x = [];
  for (let i = 0; i < p.length; i++) x.push(nums.length === p.length && Number.isFinite(nums[i]) ? nums[i] : (await below(NUMBER_STEPS)) / 1e6);
  const picks = p.map((pi, i) => {
    const own = span(pi, x[i]), now = span(curve ? temperTo(pi, usualTarget(r, pi.length)) : temper(pi, r), x[i]);
    return now === own ? j.picks[i] : now + 1; // the model's clash move stands while the span is the same
  });
  return { j: { ...j, picks }, how: `randomness ${r}${curve ? ' (curve)' : ''}`, numbers: x, shares: p, picks_written: j.picks };
}

// reply(t, values, request, prompt, text, lifted): the tool's reply from stage 1's prompt and raw reply (the explorer also rebuilds
// it on an earlier run's stage 1)
export function reply(t, values, request, prompt, text, j = lift(text)) {
  const questions = j.questions.map((q) => ({ q: q.q, a: q.answers })), picks = j.picks.map((p) => p - 1);
  const decided = questions.map((q, i) => q.a[picks[i]]);
  const settled = questions.map((q, i) => slots(fill(t.line, values), { N: i + 1, Q: String(q.q).trim(), A: stop(decided[i]) })).join('\n');
  const out = slots(fill(t.reply, values), { REQUEST: String(request).trim(), SETTLED: settled, STAGE1_PROMPT: String(prompt).trim(), STAGE1_REPLY: String(text || '').trim() });
  return { questions, picks, decided, text: out };
}

// fromTemplates(t): { stage1, description, instructions, templates } for a steps file. t.runner is the model id of the explore run,
// or a function of the calling model's name that returns it.
export function fromTemplates(t) {
  const runnerFor = (model) => (typeof t.runner === 'function' ? t.runner(model) : t.runner);
  // opts.values: placeholder values to use instead of drawing (the explorer draws them first, to show them); opts.call: the model
  // call (a test passes a fake); opts.runner: another explore model
  // opts.randomness: the setting above (0 to 2, 1 when left out): the question count and the weighting of the shares; opts.count: a
  // fixed question count instead (r37's weighting only is count 5)
  const stage1 = async (request, model, draw, opts = {}) => {
    const call = opts.call || (await import('./runner.mjs')).call;
    const task = String(request).trim();
    // opts.dial: what else the setting sets, 'questions' (the count, r38; the default), 'answers' (r39), 'both' (r41), 'curve' (r43) or 'none' (r37)
    const dial = opts.dial || (opts.count !== undefined ? 'none' : 'questions');
    const text = !t.randomness ? t.stage1 : dial === 'curve' ? withShape(t.stage1, curveQuestionsFor(opts.randomness), answersFor(opts.randomness)) : dial === 'both' ? withShape(t.stage1, bothQuestionsFor(opts.randomness), answersFor(opts.randomness)) : dial === 'answers' ? withAnswers(t.stage1, answersFor(opts.randomness)) : withCount(t.stage1, opts.count ?? (dial === 'none' ? 5 : countFor(opts.randomness)));
    const values = await drawValues(names(text, t.line, t.reply), draw.below, opts.values);
    const prompt = slots(fill(text, values), { REQUEST: task });
    const runner = opts.runner || runnerFor(model), t0 = Date.now(), r = await call(runner, prompt);
    const calls = [{ name: 'stage 1', runner, prompt, text: r.text, usage: r.usage, error: r.error, ms: Date.now() - t0 }];
    const lifted = lift(r.text);
    if (!lifted) return { ok: false, calls, drawn: { values }, from: draw.from, why: 'the reply has no well-formed JSON' };
    const rp = t.randomness ? await repick({ ...t, stage1: text }, values, r.text, lifted, opts.randomness, draw.below, dial === 'curve') : { j: lifted };
    const out = { ok: true, ...reply(t, values, task, prompt, r.text, rp.j), from: draw.from, calls, drawn: { values } };
    if (rp.how) Object.assign(out, { randomness: rp.how, picks_written: rp.picks_written });
    if (text !== t.stage1) Object.assign(out, dial === 'curve' ? { asked: curveQuestionsFor(opts.randomness), options: answersFor(opts.randomness) } : dial === 'both' ? { asked: bothQuestionsFor(opts.randomness), options: answersFor(opts.randomness) } : dial === 'answers' ? { options: answersFor(opts.randomness) } : { asked: opts.count ?? countFor(opts.randomness) });
    return out;
  };
  stage1.fallback = t.fallback;
  stage1.randomness = !!t.randomness;
  return { stage1, description: t.description, instructions: t.instructions, templates: t };
}
