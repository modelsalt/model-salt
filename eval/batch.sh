#!/bin/zsh
# usage: eval/batch.sh <jobs file>; each line "<model> <prompt> <arm> <NN>". Claude runs 6 at a time, Codex runs 4 at a time;
# finished runs are skipped, so a batch can be re-run after a stop. Needs CODEX_HOME_CLEAN for GPT runs.
S=${0:A:h:h}; R=$S/eval/run.sh
grep -E '^(opus|fable)' $1 | xargs -P 6 -L 1 $R &
grep '^gpt' $1 | xargs -P 4 -L 1 $R &
wait
