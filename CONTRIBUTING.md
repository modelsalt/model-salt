# Contributing

## Report a prompt that still repeats

The most useful issue: a prompt where your model gives the same answer every time, even with Model Salt. Open an issue with:

- the prompt, word for word
- the model and the client (Claude Code, Codex, Gemini CLI, Kimi Code) with their versions
- three or more runs with Model Salt, and a few without it if you have them

## Improve a family's steps

Each model family has its own service in `services/<family>/` (`anthropic`, `openai`), because what takes one model off its usual answer doesn't work the same way for another. Models in a family share their habits, so they share the steps. A change goes into one family's folder and is scored against each member's plain answers.

| You found | Put it in | Evidence it needs |
|---|---|---|
| A habit: something the plain model does run after run | `services/<family>/habits.mjs`, one line, with a comment naming the prompt and the count | the plain runs of that prompt |
| A new way of writing the steps | a new file in `services/<family>/steps/`. Never edit a released one | a scored run against the current steps |
| A model that behaves differently from its family | its own entry in `services/<family>/models.mjs` | runs on at least two prompts showing the difference |
| A new model in a family | a line in `services/<family>/models.mjs` and a case in `eval/run.sh` | plain runs and the family's steps on two prompts |
| A new family | a new folder (copy the nearest one), plus a line in `src/services.mjs` | plain runs, then its own scored runs |

`service.mjs` names the current steps. A change ships when it beats the current steps on the tuning prompts **and** doesn't lose on the held-out ones (`eval/prompts.tsv`, column 3). Add it to `CHANGELOG.md` with its numbers.

## Score a change

```sh
eval/run.sh <model> <prompt> <arm> <NN>             # one run. arm: plain, service, or a steps file name in services/<family>/steps/
eval/batch.sh <jobs file>                           # many runs: lines of "<model> <prompt> <arm> <NN>"
eval/judge-all.sh 10 <arm>                          # the brief check per run, then "how many different answers" per set
python3 -I eval/score.py 10 plain <current> <arm>   # the table: different answers, still the brief, tokens and time against plain
```

Runs go to `eval/runs/<model>/<prompt>/<arm>-NN/` and run on your own Claude Code and Codex sign-ins.

- **Different answers:** Claude Opus 5.5 groups an arm's answers, blind and shuffled, into "the same answer" groups (`eval/judge-set.sh`). Two pictures are the same if they'd be called the same picture in other colours. Two texts are the same if they rest on the same central idea.
- **Still the brief:** Claude Sonnet 5.5 checks each answer against the request (`eval/judge-fit.sh`).
- **Cost:** output tokens and seconds per run, against plain on the same prompt.
- Keep sets small: 5 runs per prompt to screen, 10 to confirm. Habits come from the tuning prompts only, never from a held-out one.

## Licence of contributions

Code you contribute is under MIT, like the rest of the code. Example runs you add to `examples/` are under CC BY 4.0, like the ones there.

## Tests

```sh
node --test checks/*.test.mjs
scripts/smoke.sh
```
