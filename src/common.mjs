// Building blocks the services' steps share. A service may import these or replace them with its own.

// The rule that keeps a varied answer on the brief (from the v0.5-v0.9 rounds: without it, pelicans in costumes, on coins)
export const FIDELITY = 'Someone shown only the result must name the request at first glance. Add nothing the request didn\'t ask for: in a picture no role, costume, props, extra characters, slogans or gimmicks; in any task, don\'t present it as some other object. Never invent facts (names, times, topics). Keep every limit the request sets (length, form, count). If a draw doesn\'t fit the request or would break it, use the nearest version that fits. If the task has one right answer or a fixed convention, vary only what the convention leaves open.';

// Families: for the "draws" framing, 10 broad families for each of five fixed choices; outside numbers pick one each.
// Family 1 is always "your usual". From v0.8 (16 Oct): GPT-6.1 wrote its own options all next to its default, so the server holds them.
export const FAMILIES = {
  Interpretation: [
    'your usual reading of the request',
    'a less common but real kind or variety of the subject',
    'a different moment of the action: starting, stopping, turning or mid-stride',
    'the subject at its calmest: paused, balanced, still',
    'the subject at its most energetic: fast, straining, mid-motion',
    'one true detail made central (a mechanism, a texture, a gesture)',
    'the most minimal version that still reads at once',
    'the most specific, detailed version',
    'a young, old, worn or brand-new state of the subject',
    'an unusual but true posture or arrangement',
  ],
  Technique: [
    'your usual technique',
    'line only: no filled shapes, every form drawn with strokes (ink, pencil or one continuous line)',
    'a print process: woodcut or linocut, solid dark shapes with carved white cut lines and no gradients',
    'painterly: watercolour or gouache, soft overlapping washes, uneven edges, visible strokes',
    'strict geometry: every form built only from circles, rectangles and triangles, nothing freehand',
    'technical drawing: thin even lines on a pale or blueprint ground, construction lines and dimension marks, no shading',
    'a grid: pixel art or mosaic, every form made of square cells of one size',
    'cut and layered: paper cut-outs, flat torn or cut layers with drop shadows between them',
    'light: neon tubes or glowing outlines on a dark ground, forms made of light, not fills',
    'a historical or folk craft: stained glass with lead lines, tiles, embroidery stitches or an old print tradition',
  ],
  Viewpoint: [
    'your usual viewpoint',
    'from far away, the subject small',
    'very close, the subject cropped by the frame',
    'from directly above',
    'from low down, looking up',
    'from behind or three-quarter rear',
    'head-on, coming toward the viewer',
    'from the opposite side to your usual',
    'three-quarter front, from slightly above',
    'at ground level, from inside the scene',
  ],
  Composition: [
    'your usual composition',
    'off-centre, the subject at one edge with open space',
    'a strong diagonal across the frame',
    'strictly symmetrical and formal',
    'the subject filling and breaking the frame',
    'the subject tiny in a large space',
    'a low horizon, mostly sky',
    'a high horizon, mostly ground',
    'seen through an opening: a window, an arch or a circle',
    'a tall, narrow vertical format',
  ],
  Setting: [
    'your usual setting',
    'at night',
    'in rain or fog',
    'at dusk or golden hour',
    'in snow or winter',
    'in hard midday sun with strong shadows',
    'on a city street',
    'on an open country road',
    'by the sea',
    'against one strong flat colour, nothing else',
  ],
};

// Moves: general ways to leave a default, for any task (picture, text, name, idea). The "swerve" framing.
export const MOVES = [
  'Opposite: take the opposite of that choice (left for right, still for moving, quiet for loud, end for start, dark for light).',
  'Scale: go much closer or much further away than you normally would, or make the whole much smaller or much larger.',
  'Time: a different time of day, season or era, or a different moment (before, after, half-way through).',
  'Medium: make it in a different technique, material or form (another art technique, another poetic or prose form, another kind of word).',
  'Place: put it in a specific real place or tradition other than the one you assumed, where the request still fits.',
  'Less: strip that choice down to the minimum that still reads at once.',
  'More: replace the generic version with one true, specific particular, in full detail.',
  'Point of view: change who sees or tells it and from where (another camera position, another narrator, another person using it).',
  'Variety: swap the most obvious kind for a less common but real kind or variety.',
  'Order: change the structure: the layout or sequence, where it starts and where the weight sits.',
  'Feeling: aim for a different, specific emotion than the obvious one.',
  'Hidden side: show what is usually left out: the back, the inside, the mechanism, the cost, the before or the after.',
  'Constraint: put one hard formal rule on that choice (one colour, one kind of shape, one sentence, strict symmetry, a fixed rhythm).',
  'Contrast: set that choice in strong tension with the rest (hard light on soft forms, a plain word for a grand idea).',
];

// Makers: outside eyes for the "lens" framing. Each changes how a thing is made, never what is asked.
export const MAKERS = [
  'a Japanese ukiyo-e woodblock printmaker of the 1830s', 'a Swiss modernist poster designer of the 1950s', 'a Victorian natural-history engraver',
  'a children\'s picture-book illustrator working in gouache', 'a patent draughtsman of the 1890s', 'a Bauhaus teacher of form',
  'a Persian miniature painter', 'a mid-century American comic-strip artist', 'a medieval stained-glass maker', 'an Inuit stone-cut printmaker',
  'a Soviet constructivist designer', 'a Dutch Golden Age still-life painter', 'an Art Nouveau illustrator', 'a 1980s arcade pixel artist',
  'a Mexican papel picado cutter', 'a Chinese ink-wash painter', 'a West African kente weaver', 'a Scandinavian textile printer of the 1960s',
  'a scientific illustrator for a field guide', 'an architect drawing an axonometric', 'a neon-sign bender', 'a Roman mosaicist',
  'a 1920s Art Deco travel-poster artist', 'a Polish film-poster designer of the 1970s', 'a cross-stitch sampler maker', 'an Aboriginal dot painter',
  'a courtroom sketch artist', 'a weather forecaster', 'a cartographer making a hand-drawn map', 'a stage lighting designer',
  'a documentary photographer', 'a film director planning one shot', 'a ballet choreographer', 'a jazz drummer',
  'a structural engineer', 'a watchmaker', 'a beekeeper', 'a lighthouse keeper', 'a deep-sea diver', 'a mountain guide',
  'a night-shift nurse', 'a stand-up comedian', 'a sports commentator', 'a radio-drama writer of the 1940s', 'a writer of instruction manuals',
  'a haiku master of the Edo period', 'a hard-boiled detective novelist', 'a writer of fairy tales', 'a war correspondent', 'a gardener',
  'a toy maker', 'a chef plating one dish', 'a perfumer', 'a museum label writer', 'a botanist', 'a geologist', 'an astronomer',
  'a carpenter', 'a potter', 'a tailor', 'a typographer', 'a puppeteer', 'a sailor', 'a librarian', 'a chess player', 'a translator',
  'a nursery-rhyme writer', 'a Norse saga teller', 'a minimalist composer', 'a folk singer', 'a crossword setter', 'a mime',
];

// What every service tells the client. The tool name stays the same across services so a prompt or a doc works with any.
export const TOOL_NAME = 'model_salt';
// Names an install from before the rename may still call (see History in README.md): accepted by tools/call and prompts/get
// for one release, never listed.
export const OLD_TOOL_NAMES = ['creative_seed'];
export const OLD_PROMPT_NAMES = ['seed'];
export const INSTRUCTIONS = 'Language models give the same typical answer to the same open-ended request. Before any task with room for choices (art, SVG or image prompts, writing, naming, ideas, stories, designs, challenges, product copy), call model_salt once and follow what it returns. Skip it for tasks with one right answer.';
// The listing text (server instructions, tool description) says what Model Salt does and how to call it, never how it works:
// the method is versioned in each service's steps/ and may differ per model, and this text must stay true when it changes.
export const DESCRIPTION = 'Language models give the same typical answer to the same open-ended request. Call this once before any creative or open-ended task: it returns what to do for this task, tuned to your model, so the result is varied and still exactly what was asked. Then follow it.';
