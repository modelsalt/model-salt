// The GPT family's habits, as measured on GPT-6.1 Sol: what its plain answers share, run after run. Each line names the prompts it was seen on
// (eval/runs/gpt-6.1-sol/<prompt>/plain.groups-10.json). Found one more? Add it with its evidence: see CONTRIBUTING.md.
// Mined from the tuning prompts only; lighthouse and haiku are held out so the habits are tested on prompts they never saw.
export const HABITS = [
  // pelican 2 looks in 10, teapot 1 in 10
  'in pictures you draw flat vector shapes with even fills or one soft gradient and a dark outline, the subject side-on and centred, in plain daylight on a pale empty background',
  // the v0.9 rounds: it plans another viewpoint and still draws its side view
  'a side view drawn with round parts as full circles is exactly the habit to break: unless the viewpoint pick is side-on, nothing in the result is seen in flat side profile',
  // story: a girl brings the robot in an abandoned station a broken object
  'in stories you write the lonely caretaker in an abandoned place who is given purpose by a child',
  // game: "Pocket Tides" 6 of 10
  'in names you reach for cosy small-and-sea words (pocket, tides, islands)',
].join('; ') + '.';
