// Random input lines for a step 1 text (0.27c): {{SEEDS n}} becomes n lines, each two words from the 174,233-word list and a
// value from 1,000,001 steps between 0 and 1; {{PAIRS n}} (0.25m, 0.27b) becomes n lines of one word and one value;
// {{VALUES n k}} (0.29, 19 Oct) becomes n lines "Qi: v1, ..., vk" of values from 1,000,001 steps, no words; {{WORDS n k}} (0.29, r10)
// n lines "Qi: \"w1\", ..., \"wk\"" of words from the list, one per answer.
import WORDS from './wordlist.mjs';
const value = async (below) => ((await below(1000001)) / 1e6).toFixed(6);
const word = async (below) => WORDS[await below(WORDS.length)];
async function words(k, below) { const w = []; for (let i = 0; i < k; i++) w.push(`"${await word(below)}"`); return w; }
async function vals(k, below) { const v = []; for (let i = 0; i < k; i++) v.push(await value(below)); return v; }
export async function fill(text, below) {
  const parts = text.split(/\{\{(PAIRS|SEEDS|VALUES|WORDS)(?:\s+(\d+))?(?:\s+(\d+))?\}\}/);
  let s = parts[0];
  for (let i = 1; i < parts.length; i += 4) {
    const k = Math.min(Math.max(parseInt(parts[i + 1] || '6', 10), 1), 50), lines = [];
    const per = Math.min(Math.max(parseInt(parts[i + 2] || '5', 10), 1), 20);
    for (let j = 0; j < k; j++) lines.push(parts[i] === 'WORDS' ? `Q${j + 1}: ${(await words(per, below)).join(', ')}` : parts[i] === 'VALUES' ? `Q${j + 1}: ${(await vals(per, below)).join(', ')}` : parts[i] === 'SEEDS' ? `${j + 1}. "${await word(below)}" "${await word(below)}", ${await value(below)}` : `${j + 1}. "${await word(below)}", ${await value(below)}`);
    s += lines.join('\n') + parts[i + 3];
  }
  return s;
}
