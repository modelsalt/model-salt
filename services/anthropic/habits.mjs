// The Claude family's habits, as measured on Opus 5.5: what its plain answers share, run after run. Each line names the prompts it was seen on
// (eval/runs/opus-5.5/<prompt>/plain.groups-10.json). Found one more? Add it with its evidence: see CONTRIBUTING.md.
// Mined from the tuning prompts only; lighthouse and haiku are held out so the habits are tested on prompts they never saw.
export const HABITS = [
  // pelican 1 look in 10, teapot 2 in 10
  'in pictures you draw a flat cartoon with dark outlines and glossy gradients, the subject seen side-on and centred, facing right, under a blue sky with a sun top right or on a cream background',
  // teapot: teal/blue, gold knob and band, wavy steam
  'you reach for teal and blue with gold accents',
  // story: 6 groups in 10, the biggest the faithful machine in an abandoned place that a child reaches
  'in stories you write the faithful machine still working in an empty place until a child or a small gift reaches it',
  // game: "Tidepool" 9 of 10
  'in names you reach for one soft nature word (tides, pools, the sea)',
].join('; ') + '.';
