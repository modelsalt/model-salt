// The models in this family, and the per-model override layer. The family's steps (service.mjs) are for every member;
// an override (its own habits or steps) goes in only where eval runs show the model behaves differently from the family.
// `match` maps the tool's `model` argument (the model names itself) to a member.
export default [
  { id: 'gpt-6.1-sol', name: 'GPT-6.1 Sol', match: /sol/i }, // the family's steps were tuned on it (eval rounds 1-2)
  { id: 'gpt-6-astra', name: 'GPT-6 Astra', match: /astra/i }, // shares the family's habits (measured 17 Oct)
];
