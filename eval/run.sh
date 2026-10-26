#!/bin/zsh
# usage: eval/run.sh <model> <prompt id> <arm> <NN>; one run into eval/runs/<model>/<prompt>/<arm>-<NN>/
# model: opus-5.5 or fable-5.1 (Claude Code CLI, bare: no tools, system prompt ".", effort high; the anthropic service), or
# gemini-4-argon (eval/gemini.mjs on the Gemini API with a key, the anthropic service), kimi-k3 (eval/kimi.mjs, the same on Moonshot's API), or
# gpt-6.1-sol or gpt-6-astra (Codex CLI, read-only, a clean CODEX_HOME holding only the sign-in; the openai service). Both on the plans, $0. arm: plain (no MCP server), or a steps file:
# services/<family>/steps/<arm>.mjs if it exists, else eval/arms/<arm>.mjs, served by src/stdio.mjs over stdio.
# The prompt (eval/prompts.tsv) is sent as is, with no hint to use the tool.
S=${0:A:h:h}; key=$1; pid=$2; arm=$3; n=$4; d=$S/eval/runs/$key/$pid/$arm-$n
[[ -s $d/reply.txt ]] && exit 0
# Harness noise is not a result: a Claude run that calls a tool the test doesn't have (it tries to Write a file, which this
# bare setup disables) or that ends in a spurious safeguards error is moved to eval/runs-failed/ and run again, up to 2 times.
if [[ -z $NOISE_TRY ]]; then
  for t in 1 2 3; do
    NOISE_TRY=$t $0 $@; rc=$?
    [[ $key != opus-* && $key != fable-* ]] && exit $rc
    why=""
    jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | .name' $d/transcript.jsonl 2>/dev/null | grep -v '^mcp__seed__' | grep -qv '^Write$' && why="called a tool the test does not have"
    [[ -z $HARNESS_WRITE ]] && jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | .name' $d/transcript.jsonl 2>/dev/null | grep -q '^Write$' && why="called a tool the test does not have"
    grep -qE 'API Error|safety classifier|safety filter|told not to produce|cut off partway' $d/reply.txt 2>/dev/null && why="safeguards error"
    # a reply with no seed list that opens with a note about not being able to save a file was taken off course by the
    # missing file tool, not by the steps
    # not for a web design or app icon: the page or icon is in the reply, and the note is the model's own answer to having no file tool
    if [[ $arm != plain && $arm != site-webdesign-* && $arm != site-icon-* && $arm != site-appicon-* ]] && ! head -1 $d/reply.txt | grep -qE '^(First decision|Usual|Seed |Value |Q: |[0-9]+\. |Choices|Readings|Who:|Draft:)' && head -c 400 $d/reply.txt | grep -qiE "(save|write|writing|wrote).{0,25}files?|file.{0,20}(writing|saving)|Write tool"; then why="opened with a file note and no list"; fi
    [[ -z $why || $t == 3 ]] && { [[ -n $why ]] && print -r -- "$why (kept after 3 tries)" > $d/noise.txt; exit $rc; }
    mkdir -p $S/eval/runs-failed/noise; f=$S/eval/runs-failed/noise/$key-$pid-$arm-$n-try$t; rm -rf $f; mv $d $f; print -r -- "$why" > $f/noise.txt
    echo "$key/$pid/$arm-$n: harness noise ($why), running again"
  done
fi
# the playground (eval/playground) passes its own request and steps file: PG_PROMPT=<file> PG_STEPS=<file> eval/run.sh <model> playground <try> <n>
if [[ -n $PG_PROMPT ]]; then kind=svg; mkdir -p $d/empty; cp $PG_PROMPT $d/prompt.txt; cd $d/empty
else
line=$(awk -F'\t' -v p=$pid '$1==p' $S/eval/prompts.tsv); [[ -z $line ]] && { echo "unknown prompt $pid" >&2; exit 1; }
kind=$(cut -f2 <<< $line); mkdir -p $d/empty; cut -f4 <<< $line > $d/prompt.txt; cd $d/empty
fi
# a picture prompt (svg, html), for the clients with no image tool (eval/gemini.mjs, kimi.mjs: SALT_PICTURE): the prompt's own kind, and
# for a run through the explorer (PG_PROMPT) the kind of the site prompt whose text it is; text otherwise
pic=$kind; [[ -n $PG_PROMPT ]] && pic=$(awk -F'\t' -v q="$(cat $d/prompt.txt)" '$4==q {print $2; exit}' $S/eval/prompts.tsv); [[ $pic == svg || $pic == html ]] || pic=
CLAUDE=${CLAUDE:-$HOME/.local/bin/claude}; CODEX=${CODEX:-/Applications/Codex.app/Contents/Resources/codex-cli/bin/codex}
# Gemini and Kimi have no service of their own: they get the Claude family's
case $key in opus-*|fable-*|gemini-*|kimi-*) fam=anthropic ;; gpt-*) fam=openai ;; esac
steps=$S/services/$fam/steps/$arm.mjs; [[ -f $steps ]] || steps=$S/eval/arms/$arm.mjs; [[ -n $PG_STEPS ]] && steps=$PG_STEPS
# arm "service": the service as installed, with its current steps (services/<family>/service.mjs), no --steps
[[ $arm == service ]] && steps=$S/services/$fam/service.mjs
[[ $arm != plain && ! -f $steps ]] && { echo "no steps file for $arm" >&2; exit 1; }
sargs="\"$S/src/stdio.mjs\",\"$fam\",\"--steps\",\"$steps\""
[[ $arm == service ]] && sargs="\"$S/src/stdio.mjs\",\"$fam\""
# SALT_LOG: the service log as an argument (Codex starts MCP servers with a clean environment, so the variable would not reach it)
[[ -n $SALT_LOG ]] && sargs+=",\"--log\",\"$SALT_LOG\""
# HARNESS_DESCRIBE=1 (round r32): the client describes the picture it would make instead of making it, as the last thing in its own
# conversation, so a run costs no drawing (the description shows well enough whether it left the standard view or rendering). It goes in the system prompt (Claude) or the developer instructions (Codex), never in the user's prompt.
DESCRIBE="Test run: if the request asks for a picture, an image or an SVG, do not make it. In its place, as your final reply, describe in 4 to 6 plain sentences exactly what you would make: where the viewer stands relative to the subject, which way the subject faces or moves, the style, the composition and the palette. Do everything else exactly as you normally would."
sysp="."; [[ -n $HARNESS_DESCRIBE ]] && sysp=$DESCRIBE
t0=$(date +%s)
case $key in
  opus-5.5|fable-5.1)
    mcp=(); [[ $arm != plain ]] && mcp=(--mcp-config "{\"mcpServers\":{\"salt\":{\"type\":\"stdio\",\"command\":\"node\",\"args\":[$sargs]}}}" --allowedTools mcp__salt__model_salt)
    # HARNESS_WRITE=1: the Write tool too, in this run's empty folder, as in a normal Claude Code session (without it the model
    # sometimes tries to save the SVG, fails, and answers with a note instead of following the steps)
    tools=""; [[ -n $HARNESS_WRITE ]] && { tools="Write"; mcp+=(--allowedTools Write); }
    for try in 1 2; do  # about 1 run in 40 comes back empty; retry once
      $CLAUDE -p --model claude-${key//./-} --effort high --system-prompt "$sysp" --exclude-dynamic-system-prompt-sections \
        --tools "$tools" --setting-sources "" --strict-mcp-config $mcp --no-session-persistence \
        --output-format stream-json --verbose < $d/prompt.txt > $d/transcript.jsonl 2> $d/stderr.txt
      jq -r 'select(.type=="result") | .result // ""' $d/transcript.jsonl > $d/reply.txt
      # a web design or icon: the result is the last turn only, and after an output-limit resume (or a page "saved" in a
      # make-believe tool call) the page sits in an earlier turn; then the reply is every turn's text (5 of 20 pages lost)
      if [[ $arm == site-webdesign-* || $arm == site-icon-* || $arm == site-appicon-* || $pid == site-webdesign || $pid == site-icon || $pid == site-appicon ]] && ! grep -qiE '</html>|</svg>' $d/reply.txt; then
        jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="text") | .text' $d/transcript.jsonl > $d/reply.txt; fi
      [[ -s $d/reply.txt ]] && break
    done
    jq -r 'select(.type=="user") | .message.content[]? | select(.type=="tool_result") | (.content | if type=="array" then map(.text) | join("") else . end)' $d/transcript.jsonl > $d/seed.txt
    jq -c 'select(.type=="result") | {output_tokens: .usage.output_tokens, api_usd: .total_cost_usd}' $d/transcript.jsonl > $d/cost.json ;;
  gpt-6.1-sol|gpt-6-astra)
    # Codex doesn't pass MCP server instructions to the model the way Claude Code does, so seeded runs get them as developer instructions
    mcp=(); [[ $arm != plain ]] && mcp=(-c 'mcp_servers.seed.command="node"' -c "mcp_servers.seed.args=[$sargs]" -c 'mcp_servers.seed.tool_timeout_sec=900' \
      -c "developer_instructions=\"$(node -e "Promise.all([import('$S/src/common.mjs'),import('$steps')]).then(([c,m])=>console.log(m.instructions||m.default?.instructions||c.INSTRUCTIONS))")${HARNESS_DESCRIBE:+ $DESCRIBE}\"")
    for try in 1 2; do
      CODEX_HOME=${CODEX_HOME_CLEAN:?} $CODEX exec --skip-git-repo-check --ephemeral -s read-only -m $key \
        $mcp --json -o $d/reply.txt - < $d/prompt.txt > $d/transcript.jsonl 2> $d/stderr.txt
      # a picture Codex drew with its own image tool (the app icon prompt of 23 Oct asks for no SVG) is saved under
      # $CODEX_HOME_CLEAN/generated_images/<thread id>/, not in the reply: the last one is the run's image.png. With the tool,
      # Codex often ends with no text after drawing it, so the picture counts as the answer
      tid=$(jq -r 'select(.type=="thread.started") | .thread_id' $d/transcript.jsonl | head -1)
      g=$(ls -t $CODEX_HOME_CLEAN/generated_images/$tid/*.png 2>/dev/null | head -1); [[ -n $tid && -n $g ]] && cp $g $d/image.png
      [[ -s $d/reply.txt || -s $d/image.png ]] && break
    done
    jq -r 'select(.type=="item.completed" and .item.type=="mcp_tool_call") | .item.result.content[]?.text // empty' $d/transcript.jsonl > $d/seed.txt
    jq -sc '[.[] | select(.type=="turn.completed") | .usage.output_tokens] | {output_tokens: add}' $d/transcript.jsonl > $d/cost.json ;;
  gemini-*|kimi-*)
    # Gemini 4 Argon and Kimi K3: eval/gemini.mjs on the Gemini API with the key, a bare client as the Claude runs are; with the tool,
    # the server's instructions as the system instruction, as Claude Code passes them
    gm=(); [[ $arm != plain ]] && gm=(--mcp "{\"command\":\"node\",\"args\":[$sargs]}")
    for try in 1 2; do
      SALT_PICTURE=$pic node $S/eval/${key%%-*}.mjs $key $d $gm < $d/prompt.txt 2> $d/stderr.txt
      [[ -s $d/reply.txt ]] && break
    done ;;
  *) echo "unknown model $key" >&2; exit 1 ;;
esac
print $(( $(date +%s) - t0 )) > $d/seconds.txt
if [[ $kind == svg ]]; then
  python3 -I -c "import re,sys;t=open(sys.argv[1]).read();m=re.findall(r'<svg.*?</svg>',t,re.S);open(sys.argv[2],'w').write(m[-1]) if m else None" $d/reply.txt $d/image.svg
  # with HARNESS_WRITE the SVG may be in a saved file instead of the reply
  [[ ! -s $d/image.svg ]] && f=$(ls -t $d/empty/*.svg 2>/dev/null | head -1) && [[ -n $f ]] && cp $f $d/image.svg
  [[ -s $d/image.svg ]] && rsvg-convert -w 600 -h 450 -a -b white $d/image.svg -o $d/render.png 2>/dev/null
fi
rmdir $d/empty 2>/dev/null; [[ -n $HARNESS_WRITE ]] && print -r -- "write" > $d/harness.txt; [[ -n $HARNESS_DESCRIBE ]] && print -r -- "describe" > $d/harness.txt
echo "$key/$pid/$arm-$n: called=$([[ -s $d/seed.txt ]] && echo y || echo n) $(<$d/cost.json) $(<$d/seconds.txt)s"
