# How Model Salt works

## One call

The tool `model_salt` takes the user's `request` word for word, the calling `model`'s name and, if the user asks for it, a `randomness` setting from 0 to 2 (left out, 1).

1. **Explore, in a separate run.** The server sends the request, with a few random words drawn from outside the model, to a fresh run of the same model family on the machine's own Claude Code or Codex sign-in. That run names the biggest open decisions an expert would ask about (the questions) and a set of answers to each, its usual one first. At the default setting that is 5 questions with 5 answers each (3 with 2 at setting 0, 6 with 10 at setting 2).
2. **Pick.** Randomness from outside the model picks one answer per question. The setting decides how often the usual answer is kept: always at 0, 70% at 0.5, 45% at 1, 25% at 1.5, and no more often than any other answer at 2.
3. **Answer.** The tool returns the questions with their picked answers. The caller's model does the user's request in its own conversation and makes every answer show in the result.

If the explore run can't start (no sign-in, no CLI), the tool says nothing was settled and the model carries on as asked. The explore run goes through Codex for the `openai` service and through Claude Code, on Claude Opus 5.5 (Fable 5.1 for a Fable caller), for the `anthropic` service.

## One service per model family

Models in a family share their habits (Fable draws Opus's pelican, Astra names its game like Sol), so a family shares its steps. Each family can change its steps without changing the tool.

| Service | Models measured | Notes |
|---|---|---|
| `services/anthropic/` | Claude Opus 5.5, Claude Fable 5.1, and for now Gemini 4 Argon and Kimi K3 | the client's model gets the settled answers only |
| `services/openai/` | GPT-6.1 Sol, GPT-6 Astra | the client's model also gets the explore run in full, which GPT follows more closely |

`setup` picks the service for each client: `anthropic` for Claude Code, Gemini CLI and Kimi Code, `openai` for Codex. A model from another family still gets the steps.

## Files

- `src/stdio.mjs` the MCP server over stdio (the package's `model-salt` command), and `setup` / `uninstall` (`src/setup.mjs`)
- `src/server.mjs` the MCP handler. `src/template-steps.mjs` the explore, pick and answer steps. `src/runner.mjs` the explore run on Claude Code or Codex
- `src/entropy.mjs` the outside randomness (below). `src/words.mjs` 174,323 words (Webster's 2nd, 1934, public domain)
- `services/<family>/`: `service.mjs` (the listing text and the current steps), `steps/` (the steps: `0.45a.mjs` is the 1.0.0 steps, named by its development number), `models.mjs` (the members), `habits.mjs` (what each plain model does run after run, with the evidence)
- `plugin/` the Codex and Claude Code plugins, the Gemini CLI extension and the skill. `alias/` the `model-salt` short-name package
- `eval/` the runner and judges for scoring a change (see [CONTRIBUTING.md](../CONTRIBUTING.md)). `checks/` tests. `examples/` every run shown on modelsalt.com

## Why it works this way

Every step is there because a simpler one failed in a measured run:

| Tried | What happened |
|---|---|
| Random noise in the prompt (hex, 200 random words, a seed number) | Same picture. The model reads past meaningless input. |
| "Use this seed to decide the style" | The model makes up a decoding and still draws the same picture. |
| "Avoid the obvious, surprise me" | A new default: overhead view, every time. |
| Let the model make its own random chain of words | Drifts to the same few words ("lantern" 11 of 12 times). |
| A random word for the subject | Varies the theme, never the camera: all faced right. |
| Menus ordered "further from your default" | The same walk every run: 7 of 8 faced left. |
| Content dice with no fidelity rules | Pelicans in costumes, on coins, in manuscripts. |
| The model writes its own 10 options per choice | Works on Claude. GPT-6.1 lists ten near-identical options and draws the same flat, side-on pelican (2 looks in 10). |
| One prompt for every model, or one that detects the caller | Ends up as the lowest common fix: what GPT needs (fixed picks) holds Opus back, what Opus does best (open moves) GPT ignores. |

## Randomness

Each roll XORs 32 bytes from every source that answers within 2.5 s (`roll()` in `src/entropy.mjs`):

| Source | What it is | Limits |
|---|---|---|
| random.org | atmospheric radio noise, private | 1,000,000 bits a day per IP plus a daily top-up. Free use is personal and non-commercial. Quota checked first, 10-minute back-off when low |
| LfD QRNG | quantum noise from OTH Regensburg's Quantis card, private | free, no key |
| drand quicknet | League of Entropy beacon, public, a new round every 3 s | public, so it is hashed with local bytes first. Cloudflare mirror plus two fallbacks |
| local CSPRNG | `crypto.getRandomValues` | always mixed in |

Model Salt's own test runs take random.org and LfD QRNG bytes from a shared pool (`MODEL_SALT_POOL_TOKEN`), so many processes don't drain random.org's per-IP quota. Without a pool token, which is the normal case, the server fetches from the two sources itself.

XOR of independent inputs is uniform if any one input is, so a roll is at least as random as its best source. The tool's reply names the sources that served the roll. `node scripts/entropy-check.mjs` measures every source live.
