// The Anthropic family service (Claude Opus 5.5, Fable 5.1). Its steps are versioned in steps/; this file names the current one.
import { TOOL_NAME } from '../../src/common.mjs';
import * as current from './steps/0.45a.mjs'; // v1 (1.0.0): steps 0.45a with the randomness setting (the curve of round r43, src/template-steps.mjs)
import models from './models.mjs';

// The listing text: what the tool does for the caller and how to call it, never how it works. It stays true across versions
// and per-model methods (models.mjs), so a new method needs no change here. A steps file's own description is for eval arms.
const DESCRIPTION = "Call this once before you start any creative or open-ended request (a picture, an SVG, a story, a poem, an email, a design, a name, a plan, an approach to a problem). Send the user's request word for word in `request` and name yourself in `model`. The tool returns what to settle for this request, tuned to your model, so the result is varied and still exactly what was asked. Then carry on with the user's request in this conversation, as they asked it, and make everything the tool returns show in the result, including anything that goes against your usual way of doing it.";
const INSTRUCTIONS = "Model Salt: before a creative or open-ended request, call model_salt with the request word for word in `request`. Then carry on with the user's request as asked, and make everything it returns show in the result.";

export default {
  id: 'anthropic', familyName: 'Claude (Anthropic)', family: /claude|anthropic|opus|sonnet|haiku|fable/i, client: /claude/i,
  name: 'model-salt-anthropic', version: '1.0.0', title: 'Model Salt for Claude models',
  tool: TOOL_NAME, instructions: INSTRUCTIONS, description: DESCRIPTION, steps: current.default, choose: current.choose, stage1: current.stage1, templates: current.templates, models,
};
