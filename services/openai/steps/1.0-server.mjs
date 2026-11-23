// OpenAI steps 1.0-server: the steps of Model Salt 1.1.0 for GPT models, with the same one change as
// services/anthropic/steps/1.0-server.mjs (whose stage 1 text this uses; 1.0.0 had one text for both families): no stage 3, and
// the server draws every pick. LINE, REPLY and FALLBACK are 1.0.0's OpenAI texts. Stage 1 runs on GPT through Codex
// (gpt-6.1-sol unless SALT_RUNNER_MODEL names another).
import { fromTemplates } from '../../../src/template-steps.mjs';
import { STAGE1 } from '../../anthropic/steps/1.0-server.mjs';
export { lift } from '../../../src/template-steps.mjs';
export { STAGE1 };
export default async () => 'Call this tool with the user\'s request word for word in `request`.';
export const LINE = "- Q: {{Q}}\n  A: {{A}} The result must show this.";
export const REPLY = "{{REQUEST}}\n\nBefore this, the request went through a separate exploring step. Everything from it follows in full and unchanged: the prompt it got, including its random input from outside, and the reply the model wrote, including its reasoning and choices.\n\n=== Exploring step: its prompt ===\n{{STAGE1_PROMPT}}\n\n=== Exploring step: the model's reply ===\n{{STAGE1_REPLY}}\n\n=== End of the exploring step ===\n\nDecided for this: each question the result has to settle, with the answer chosen for it. The result must show every answer:\n{{SETTLED}}\n\nFully satisfy the request in the exact form it asks for. Reply with the result only.";
export const FALLBACK = 'The random step could not run this time, so nothing was settled. Carry on with the request as asked.';

const RUNNER = () => process.env.SALT_RUNNER_MODEL || 'gpt-6.1-sol';
const steps = fromTemplates({ randomness: true, serverPick: true, keep: false, stage1: STAGE1, line: LINE, reply: REPLY, fallback: FALLBACK, runner: RUNNER });
export const stage1 = steps.stage1;
export const templates = steps.templates;
