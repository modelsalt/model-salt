// Placeholders for outside randomness in a prompt template: a random word or number goes in with <word_01> or <number_01>.
// Numbers span a million steps, as values of 1 to 100 gave the models too few distinct inputs.
//   <word_NN>    a word drawn from the 174,233-word list (src/wordlist.mjs)
//   <number_NN>  a value from 0.000000 to 1.000000, six decimals: 1,000,001 values
// The same name gets the same value everywhere in one fill; different names are drawn independently. Every number in the services
// and the explorer comes from here, and checks/random-range.test.mjs fails if a range drops under 1,000,000.
import WORDS from './wordlist.mjs';

export const NUMBER_STEPS = 1000001; // values 0..1,000,000, written as six decimals between 0 and 1
export const MIN_NUMBER_RANGE = 1000000;
const RE = /<(word|number)_(\d{1,3})>/g;

export const number = async (below) => ((await below(NUMBER_STEPS)) / 1e6).toFixed(6);
export const word = async (below) => WORDS[await below(WORDS.length)];

// the placeholder names a set of texts uses, in order of first use: ['word_01', 'number_01', ...]
export function names(...texts) {
  const out = [];
  for (const t of texts) for (const m of String(t || '').matchAll(RE)) { const k = `${m[1]}_${m[2]}`; if (!out.includes(k)) out.push(k); }
  return out;
}

// draw(names, below, preset): a value for every name; a name already in preset keeps its value
export async function drawValues(list, below, preset = {}) {
  const v = {};
  for (const k of list) v[k] = preset[k] !== undefined ? String(preset[k]) : k.startsWith('word_') ? await word(below) : await number(below);
  return v;
}

// fill(text, values): every placeholder replaced by its value; a name without a value is left as it is
export const fill = (text, values) => String(text).replace(RE, (s, kind, n) => values[`${kind}_${n}`] ?? s);
