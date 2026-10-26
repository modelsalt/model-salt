// The OpenAI family service (GPT-6.1 Sol, GPT-6 Astra). Its steps are versioned in steps/; this file names the current one.
import { TOOL_NAME } from '../../src/common.mjs';
import * as current from './steps/0.45a.mjs'; // v1 (1.0.0): steps 0.45a with the randomness setting (the curve of round r43, src/template-steps.mjs)
import models from './models.mjs';

// The listing text: what the tool does for the caller and how to call it, never how it works. It stays true across versions
// and per-model methods (models.mjs), so a new method needs no change here. A steps file's own description is for eval arms.
const DESCRIPTION = "Call this once before you start any creative request (a picture, an SVG, a story, a poem, an email, a design, a name, a plan). Send the user's request word for word in `request` and name yourself in `model`. The tool returns the request with what to do for it, tuned to your model, so the result is varied and still exactly what was asked. Then do the request exactly as the returned text says.";
const INSTRUCTIONS = "Model Salt: before a creative request, call the tool with the request word for word in `request`, then follow the text it returns.";

export default {
  id: 'openai', familyName: 'GPT (OpenAI)', family: /gpt|openai|chatgpt|codex|\bo[1-9]\b|sol|astra|luna|terra/i, client: /codex|openai|chatgpt/i,
  name: 'model-salt-openai', version: '1.0.0', title: 'Model Salt for GPT models',
  tool: TOOL_NAME, instructions: INSTRUCTIONS, description: DESCRIPTION, steps: current.default, choose: current.choose, stage1: current.stage1, templates: current.templates, models,
};
