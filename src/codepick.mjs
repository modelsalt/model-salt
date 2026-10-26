// Code picks (0.27, 18 Oct): the model writes the choices that matter and 3 options for each, and sends them back to the
// tool; code, not the model, picks one option of each from the outside random bytes. A steps file that exports `choose`
// (made here) turns on the tool's `choices` argument (server.mjs).
// The model suggests, code chooses: the model writes the options, and outside randomness, not the model, picks among them.

export const MAX_CHOICES = 12;

// what's wrong with a `choices` argument, or '' when it is well formed: 1 to 12 choices, each a name and exactly 3 options
export function problem(choices, k = 3) {
  if (!Array.isArray(choices) || !choices.length) return 'choices must be a list with at least one choice';
  if (choices.length > MAX_CHOICES) return `at most ${MAX_CHOICES} choices`;
  for (const [i, c] of choices.entries()) {
    if (!c || typeof c.choice !== 'string' || !c.choice.trim()) return `choice ${i + 1} needs a "choice" text`;
    if (!Array.isArray(c.options) || c.options.length !== k || c.options.some((o) => typeof o !== 'string' || !o.trim())) return `choice ${i + 1} ("${String(c.choice).slice(0, 80)}") needs exactly ${k} options, each a text`;
  }
  return '';
}

// makeChoose(step3, k): step3 is the text the tool returns after picking; {{PICKS}} in it becomes one line per choice; k options
// per choice (3 from 0.27a, 5 from 0.28a); the returned function carries its own `schema` for the tool's `choices` argument
// check (0.31a, 19 Oct): a text the tool returns for the first well-formed list instead of picking; the model checks its list
// for clashes and sends it again with `checked: true`, and only then does code pick. Stateless, so the HTTP worker can run it.
export function makeChoose(step3, k = 3, { check = '' } = {}) {
  const fn = async (choices, { below, from }, { checked = false } = {}) => {
    const why = problem(choices, k);
    if (why) return { ok: false, text: `Not picked: ${why}. Call this tool again with \`choices\`: a list of choices, each {"choice": "...", "options": [...]} with exactly ${k} options.` };
    if (check && !checked) return { ok: false, checking: true, text: check };
    const picks = [];
    for (const c of choices) picks.push(await below(k));
    const lines = choices.map((c, i) => `${i + 1}. ${c.choice.trim()}: ${c.options[picks[i]].trim()}`).join('\n');
    return { ok: true, picks, text: step3.replace('{{PICKS}}', lines).replace('{{FROM}}', from) };
  };
  fn.schema = schemaFor(k);
  fn.check = !!check;
  return fn;
}

export function schemaFor(k) {
  return { ...CHOICES_SCHEMA, description: CHOICES_SCHEMA.description.replace('exactly 3 options', `exactly ${k} options`), items: { ...CHOICES_SCHEMA.items, properties: { ...CHOICES_SCHEMA.items.properties, options: { type: 'array', items: { type: 'string' }, minItems: k, maxItems: k, description: `Exactly ${k} options` } } } };
}

export const CHOICES_SCHEMA = {
  type: 'array',
  description: 'Only when the text from your first call asks for it: the choices you wrote, each with exactly 3 options. Code then picks one option of each at random and returns the picks.',
  items: {
    type: 'object',
    properties: { choice: { type: 'string', description: 'The choice, as a short question' }, options: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3, description: 'Exactly 3 options' } },
    required: ['choice', 'options'],
    additionalProperties: false,
  },
};

// Questions first (0.29a, 19 Oct; research round r9): the model writes the questions alone and sends them back as `questions`;
// the tool returns them with outside random input ({{SEEDS n}}, {{VALUES n k}}, src/seedlines.mjs) and asks for the answers.
// The random input is shown only once the questions are fixed, so it moves the answers and can't shape the questions.
// makeAnswer(step2, n): step2 holds {{QUESTIONS}} and the seed placeholders, n the number of questions it expects.
import { fill } from './seedlines.mjs';
export function makeAnswer(step2, n = 5) {
  const fn = async (questions, { below }) => {
    if (!Array.isArray(questions) || questions.length !== n || questions.some((q) => typeof q !== 'string' || !q.trim())) return { ok: false, text: `Not answered: \`questions\` must be a list of exactly ${n} questions, each a text. Call this tool again with them.` };
    const qs = questions.map((q, i) => `Q${i + 1}: ${q.trim().replace(/^Q\d+\s*[:.)]\s*/i, '')}`).join('\n');
    return { ok: true, text: await fill(step2.replace('{{QUESTIONS}}', qs), below) };
  };
  fn.schema = { type: 'array', minItems: n, maxItems: n, items: { type: 'string' }, description: `Only when the text from your first call asks for it: the ${n} questions you wrote, in order. The tool returns random input for their answers.` };
  return fn;
}

// The model's own pick (0.32a, 19 Oct; research/choose.py arm p2). One more set of outside randomness after
// the questions, and the model makes the choices, so the picked answers work together. Once the list is in
// (and checked, where the steps have a check), code draws one outside word per choice instead of an answer, and the model picks
// the answers itself from the words, keeping the five consistent. makeWordPick(step3, k, { check }): step3 holds {{CHOICES}}
// (each choice with its numbered options) and {{WORDS}} (one line per choice).
import WORDS from './wordlist.mjs';
export function makeWordPick(step3, k = 5, { check = '' } = {}) {
  const fn = async (choices, { below, from }, { checked = false } = {}) => {
    const why = problem(choices, k);
    if (why) return { ok: false, text: `Not picked: ${why}. Call this tool again with \`choices\`: a list of choices, each {"choice": "...", "options": [...]} with exactly ${k} options.` };
    if (check && !checked) return { ok: false, checking: true, text: check };
    const words = [];
    for (const c of choices) words.push(WORDS[await below(WORDS.length)]);
    const list = choices.map((c, i) => `Q${i + 1}: ${c.choice.trim()}\n` + c.options.map((o, j) => `  ${j + 1}. ${o.trim()}`).join('\n')).join('\n');
    return { ok: true, words, text: step3.replace('{{CHOICES}}', list).replace('{{WORDS}}', words.map((w, i) => `Q${i + 1}: "${w}"`).join('\n')).replace('{{FROM}}', from) };
  };
  fn.schema = schemaFor(k);
  fn.check = !!check;
  return fn;
}
