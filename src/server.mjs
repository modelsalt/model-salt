// Shared MCP server: one tool that hands the model randomness from outside it, plus the steps of one service.
// Transport-free: makeHandler(service) returns handle(msg, ctx), which takes one JSON-RPC message and returns the reply
// (or null for notifications). Each model has its own service in services/<id>/ with its own versioned steps.
import WORDS from './wordlist.mjs';
import { roll, reader } from './entropy.mjs';
import { CHOICES_SCHEMA } from './codepick.mjs';
import { OLD_TOOL_NAMES, OLD_PROMPT_NAMES } from './common.mjs';
import { RANDOMNESS } from './template-steps.mjs';

// Every steps file gets a draw: `below(n)` gives a uniform integer 0..n-1 from the outside bytes, `word` a random word
// from 174,323, `from` names the sources so the model reads that the randomness isn't its own.
export async function draw() {
  const r = await roll();
  const below = reader(r.bytes);
  const word = WORDS[await below(WORDS.length)];
  const from = r.physical ? `physical random sources (${r.sources.join(', ')})` : `a fallback (${r.sources.join(', ')}; the physical sources did not answer)`;
  return { below, word, from, sources: r.sources, physical: r.physical };
}
// pick(below, list, k): k different items of a list, in random order
export async function pick(below, list, k = 1) {
  const pool = [...list], out = [];
  for (let i = 0; i < k && pool.length; i++) out.push(pool.splice(await below(pool.length), 1)[0]);
  return out;
}

const PROMPT = { name: 'salt', title: 'Start a task with Model Salt', description: 'Start a creative or open-ended task with Model Salt', arguments: [{ name: 'task', description: 'The task to do', required: true }] };

// service: { id, name, version, family, client, models, tool, instructions, description, steps }; steps: async (draw) => text.
// options.steps replaces the service's current steps (an eval arm), options.description its tool description (a steps file may
// export one); options.log records each call.
// options.choose (a steps file's export, codepick.mjs): turns on the `choices` argument; code picks one option of each.
// options.answer (makeAnswer, codepick.mjs): turns on the `questions` argument; the tool returns them with outside random input.
// options.stage1 (0.33a): turns on the `request` argument; the service runs the explore step in its own model calls (runner.mjs)
// and returns only the request with the decided answers. If that run fails, the call gets the steps' fallback text.
// The listed inputs are the public contract and say what, never how: model, request and randomness mean the same in every
// version and for every model, so the method behind them (steps/, per family and per member in models.mjs) can change freely.
// the randomness setting (src/template-steps.mjs), on steps that support it: v1 is the curve (r43, dial 'curve'); left out, it is
// 1, the default (from 26 Oct 2026. Before, a missing setting kept the model's own picks).
// A later method maps the same 0-2 scale its own way.
const MODEL_ARG = { type: 'string', description: 'Which AI model you are, as exactly as you know it (name and version). Model Salt tunes its work to each model.' };
const REQUEST_ARG = { type: 'string', description: "The user's request, word for word." };
const RANDOMNESS_ARG = { type: 'number', minimum: 0, maximum: 2, description: 'How varied the result should be: 0 the usual answer, 0.5 a little more varied, 1 clearly varied, 1.5 more, 2 as varied as it gets. Left out it is 1, the default. Set it only when the user asks for more or less randomness.' };

export function makeHandler(service, { steps = service.steps, description = service.description, choose = service.choose || null, answer = service.answer || null, stage1 = service.stage1 || null, instructions = service.instructions, repeatWindowMs = 0, log = () => {} } = {}) {
  // repeatWindowMs (stdio: one process per client session): a second call within the window returns the same draw, so a model
  // that calls the tool twice for one task never gets two different draws (it then mixed them or dropped its list)
  let last = null, picked = null, answered = null, staged = null;
  const TOOL = {
    name: service.tool,
    title: service.title,
    description,
    inputSchema: { type: 'object', properties: { model: MODEL_ARG, ...(stage1 ? { request: REQUEST_ARG } : {}), ...(stage1?.randomness ? { randomness: RANDOMNESS_ARG } : {}), ...(answer ? { questions: answer.schema } : {}), ...(choose ? { choices: choose.schema || CHOICES_SCHEMA } : {}), ...(choose?.check ? { checked: { type: 'boolean', description: 'Only when the tool asked you to check your choices: true, sent with the checked list.' } } : {}) }, required: stage1 ? ['model', 'request'] : ['model'], additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  };
  // The model names itself in the `model` argument; a member of the family may bring its own method (models.mjs: `steps`
  // and/or `stage1`, taking the same inputs), so each model can be worked with in its own way. An eval arm's options win.
  // No argument: the MCP client (clientInfo or User-Agent) at least gives the maker. A model from another family still
  // gets this family's steps, with a note.
  const member = (model) => (service.models || []).find((m) => m.match.test(model));
  const stage1For = (m) => (stage1 !== (service.stage1 || null) ? stage1 : m?.stage1 || stage1);
  const text = async (model, ctx = {}) => {
    const m = member(model);
    const t = await (steps !== service.steps ? steps : m?.steps || service.steps)(await draw());
    const ours = model ? service.family.test(model) : !ctx.client && !ctx.userAgent ? true : service.client.test(`${ctx.client} ${ctx.userAgent}`);
    return ours ? t : `${t}\n\n(These steps are tuned for ${service.familyName} models. You said you are ${model || 'another model'}; use the service for your own model family if there is one.)`;
  };
  return async function handle(msg, ctx = {}) {
    const { id, method, params } = msg;
    if (method === 'initialize') log({ method, clientInfo: params?.clientInfo, userAgent: ctx.userAgent });
    if (id === undefined || id === null) return null; // notification
    const ok = (result) => ({ jsonrpc: '2.0', id, result });
    const bad = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
    switch (method) {
      case 'initialize':
        return ok({
          protocolVersion: params?.protocolVersion || '2025-06-18',
          capabilities: { tools: {}, prompts: {} },
          serverInfo: { name: service.name, version: service.version },
          instructions,
        });
      case 'ping': return ok({});
      case 'tools/list': return ok({ tools: [TOOL] });
      case 'tools/call': {
        if (params?.name !== TOOL.name && !OLD_TOOL_NAMES.includes(params?.name)) return bad(-32602, `Unknown tool: ${params?.name}`);
        const model = String(params?.arguments?.model || '');
        log({ method, client: ctx.client, userAgent: ctx.userAgent, args: params?.arguments, member: member(model)?.id || null });
        const request = params?.arguments?.request;
        const run1 = stage1For(member(model));
        if (run1 && typeof request === 'string' && request.trim()) {
          // one run per request in a session: a second call for the same request gets the same decided answers
          if (repeatWindowMs && staged?.request === request.trim()) return ok({ content: [{ type: 'text', text: staged.text }] });
          const r = await run1(request, model, await draw(), { randomness: params?.arguments?.randomness ?? RANDOMNESS.default, dial: 'curve' }).catch((e) => ({ ok: false, why: String(e), calls: [] }));
          log({ method: 'stage1', ok: r.ok, why: r.why, from: r.from, decided: r.decided, words: r.words, picks: r.picks, randomness: r.randomness, picks_written: r.picks_written, questions: r.questions, drawn: r.drawn, calls: r.calls || [] }); // the log is local (stdio --log): it keeps every stage 1 prompt and reply
          if (r.ok) { staged = { request: request.trim(), text: r.text }; return ok({ content: [{ type: 'text', text: r.text }] }); }
          return ok({ content: [{ type: 'text', text: run1.fallback || await text(model, ctx) }] });
        }
        if (choose && params?.arguments?.choices !== undefined) {
          // in one session (stdio: repeatWindowMs set; the HTTP worker's handler is shared by every client, so it doesn't keep them)
          // the first well-formed list is picked once; a later list gets the same picks, so the model can't redraw
          if (repeatWindowMs && picked) return ok({ content: [{ type: 'text', text: `Your options were already picked; use these picks.\n\n${picked.text}` }] });
          const r = await choose(params.arguments.choices, await draw(), { checked: params?.arguments?.checked === true });
          log({ method: 'choose', ok: r.ok, checking: !!r.checking, picks: r.picks });
          if (r.ok) picked = r;
          return ok({ content: [{ type: 'text', text: r.text }] });
        }
        if (answer && params?.arguments?.questions !== undefined) {
          // the questions get their random input once; a later list gets the same text, so the model can't redraw
          if (repeatWindowMs && answered) return ok({ content: [{ type: 'text', text: `Your questions already have their random input; use it.\n\n${answered.text}` }] });
          const r = await answer(params.arguments.questions, await draw());
          log({ method: 'answer', ok: r.ok });
          if (r.ok) answered = r;
          return ok({ content: [{ type: 'text', text: r.text }] });
        }
        // text only: Claude Code hands the model structuredContent instead of the text when both are present
        if (repeatWindowMs && last && Date.now() - last.at < repeatWindowMs) return ok({ content: [{ type: 'text', text: `This is the same draw as your first call for this task; use it.\n\n${await last.text}` }] });
        const pending = text(model, ctx);
        if (repeatWindowMs) last = { at: Date.now(), text: pending };
        return ok({ content: [{ type: 'text', text: await pending }] });
      }
      case 'prompts/list': return ok({ prompts: [PROMPT] });
      case 'prompts/get':
        if (params?.name !== PROMPT.name && !OLD_PROMPT_NAMES.includes(params?.name)) return bad(-32602, `Unknown prompt: ${params?.name}`);
        return ok({ messages: [{ role: 'user', content: { type: 'text', text: `${await text('')}\n\nTask: ${params?.arguments?.task ?? ''}` } }] });
      default:
        return bad(-32601, `Method not found: ${method}`);
    }
  };
}
