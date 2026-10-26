// The services, one per model family. Static imports so the Worker bundles them all.
import opus from '../services/anthropic/service.mjs';
import gpt from '../services/openai/service.mjs';

export const SERVICES = { [opus.id]: opus, [gpt.id]: gpt };
export async function load(id) {
  const s = SERVICES[id];
  if (!s) throw new Error(`unknown service ${id}; one of ${Object.keys(SERVICES).join(', ')}`);
  return s;
}
