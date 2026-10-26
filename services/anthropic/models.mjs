// The models in this family, and the per-model override layer. The family's steps (service.mjs) are for every member;
// an override (its own habits or steps) goes in only where eval runs show the model behaves differently from the family.
// `match` maps the tool's `model` argument (the model names itself) to a member.
export default [
  { id: 'opus-5.5', name: 'Claude Opus 5.5', match: /opus/i }, // the family's steps were tuned on it (eval rounds 1-2)
  { id: 'fable-5.1', name: 'Claude Fable 5.1', match: /fable/i }, // shares the family's habits (measured 17 Oct)
];
