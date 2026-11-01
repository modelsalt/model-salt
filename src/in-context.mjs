// The exploring step done by the calling model itself, in two calls of the one tool, for a machine with no claude or codex CLI to
// run it on (src/stdio.mjs decides at start).
//   1. { request, randomness? }   the family's stage 1 prompt with its outside words and numbers, and an id
//   2. { id, explored }           the model's own stage 1 reply; code picks from it (the same repick and curve as a CLI run)
//                                 and returns the decided answers to make the result show
// The draw is kept in memory for an hour under the id; nothing is written anywhere.
import { randomBytes, randomInt } from 'node:crypto';
import { draw } from './server.mjs';
import { names, drawValues, fill } from './placeholders.mjs';
import { withShape, curveQuestionsFor, answersFor } from './template-steps.mjs';

const KEEP_MS = 60 * 60 * 1000;
const drawn = new Map(); // id -> { service, request, randomness, values, at }
const sweep = () => { for (const [k, v] of drawn) if (Date.now() - v.at > KEEP_MS) drawn.delete(k); };
// first call: the family's stage 1 prompt at this setting, its outside values drawn now
export async function start(service, request, randomness, { again = (id) => `call model_salt again with id "${id}" and your whole reply to it in \`explored\`` } = {}) {
  // ChatGPT passed the @-mention along ("Model Salt (test) Make an image of…"): the plugin's own name is not part of the request
  request = String(request).trim().replace(/^@?model salt(\s*\(test\))?[\s:,]*/i, '') || String(request).trim();
  const t = service.templates;
  const text = withShape(t.stage1, curveQuestionsFor(randomness), answersFor(randomness));
  const d = await draw();
  const values = await drawValues(names(text, t.line, t.reply), d.below);
  const id = randomBytes(6).toString('base64url');
  sweep();
  drawn.set(id, { service: service.id, request, randomness, values, at: Date.now() });
  const prompt = fill(text, values).replace(/\{\{REQUEST\}\}/g, String(request).trim());
  return { id, from: d.from, text: `Model Salt, step 1 of 2 (id ${id}). The random words and numbers below come from ${d.from}, not from you. Do this exploring step now, silently: do not show it to the user and do not do the request yet. Then ${again(id)}.\n\n=== Exploring step ===\n${prompt}\n=== End of the exploring step ===` };
}
// second call: the model's reply goes through the same code as the local server's stage 1 (lift, repick on the curve, reply)
export async function finish(service, id, explored) {
  const s = drawn.get(id);
  if (!s || s.service !== service.id) return { ok: false, text: `Model Salt: no exploring step with id "${id}" (they are kept for an hour). Call model_salt again with the request to start over, or carry on with the request as asked.` };
  // the outside numbers were drawn in call 1 (values); `below` is only a spare for a reply with the wrong question count, so call 2
  // takes nothing from the entropy pool (random.org's free share is about 780 draws a day)
  const r = await service.stage1(s.request, '', { below: async (n) => randomInt(n), from: '' }, { randomness: s.randomness, dial: 'curve', values: s.values, call: async () => ({ text: String(explored || ''), usage: {} }) });
  if (!r.ok) return { ok: false, text: `Model Salt: ${r.why}. Send your whole reply to the exploring step again in \`explored\`, ending in its \`\`\`json block, with the same id.` };
  drawn.delete(id);
  const settled = r.questions.map((q, i) => `- ${String(q.q).trim()} ${String(r.decided[i]).trim()}`).join('\n');
  // Chris's first ChatGPT test (26 Oct): after "for an image, make the image" ChatGPT replied with a written prompt and no image, so
  // the last call now says plainly that the image is made now, with the image tool, and that a prompt is not the result. Users report
  // since Dec 2025 that ChatGPT's image tool is off in a turn with a developer-mode plugin selected (community.openai.com 1369692,
  // 1382815; OpenAI support: make the image in a message without the plugin), so the model says how to get it in one more message
  return { ok: true, r, request: s.request, text: `Model Salt, step 2 of 2, the last call: decided for "${s.request}". The result must show every one of these:\n${settled}\n\nNow make the result in this same reply, and do not call model_salt again:\n- If the request asks for an image (a picture, photo, drawing, illustration, poster, logo): generate the image now with your image generation tool, from a prompt that shows every decided answer, and show the image. Do not reply with the prompt text instead of the image. Only if your image tool is not available in this chat (ChatGPT turns it off for some chats with a developer plugin selected): give the finished image prompt, then tell the user in one line to send \"Make this image\" as a new message without @Model Salt.\n- Otherwise (a story, a poem, a name, an idea, an image prompt, any text): write it in the exact form the request asks for.\nDo not mention Model Salt or these steps unless the user asks.` };
}
