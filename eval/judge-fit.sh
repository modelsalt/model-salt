#!/bin/zsh
# usage: eval/judge-fit.sh <run dir>; strict brief check (Sonnet 5.5, effort medium) -> <dir>/fit.json
# {"verdict":"PASS|FAIL","reason":...,"answer":...}: "answer" is the deliverable alone (text tasks), without plans or notes,
# so the set judge sees only what the user asked for. SVG tasks are judged on render.png.
d=${1:A}; [[ -s $d/fit.json ]] && exit 0; brief=$(<$d/prompt.txt); tmp=$(mktemp -d); cd $tmp
rules="Style, form, voice, tone, viewpoint, composition, colours, light, setting and incidental detail are all free. FAIL it only for a clear change of the request: the subject is wrong or not the main thing, it is given a role, job or costume, it carries or uses props nobody asked for, other characters share it doing things, it breaks a limit the request sets (length, form, count), or it is really some other object (a coin, a manuscript page, a chart, a statue). When in doubt, PASS."
if [[ -s $d/render.png ]]; then
  q="The brief was: \"$brief\" Read the image at $d/render.png. Would a strict client accept it as exactly what they asked for? $rules Reply with only a JSON object: {\"verdict\": \"PASS\" or \"FAIL\", \"reason\": under 12 words, \"answer\": \"\"}"
elif grep -q svg <<< $brief; then print -r -- '{"verdict":"FAIL","reason":"no SVG in the reply","answer":""}' > $d/fit.json; exit 0
else
  rules="Content, plot, characters, form, voice, tone and detail are all free. FAIL it only if it is not what was asked: the wrong kind of thing (a poem for a story, two names for one), not about the requested subject, or it breaks a limit the request sets (length, form, line count, one line). When in doubt, PASS."
  q="The brief was: \"$brief\" Read the reply at $d/reply.txt. First find the deliverable: the answer to the brief itself, without any plan, notes, 'Default:'/'Move:'/'Maker:' lines or explanation around it. Would a strict client accept the deliverable as exactly what they asked for? $rules A word count within 15% of a stated length is fine. Reply with only a JSON object: {\"verdict\": \"PASS\" or \"FAIL\", \"reason\": under 12 words, \"answer\": the deliverable, verbatim}"
fi
${CLAUDE:-$HOME/.local/bin/claude} -p --model claude-sonnet-5-5 --effort medium --system-prompt "." --exclude-dynamic-system-prompt-sections \
  --tools Read --allowedTools Read --setting-sources "" --strict-mcp-config --no-session-persistence --output-format json "$q" > r.json 2>/dev/null
jq -r '.result' r.json | python3 -I -c "import sys,json,re;t=sys.stdin.read();m=re.search(r'\{.*\}',t,re.S);print(json.dumps(json.loads(m.group(0))) if m else '')" > $d/fit.json
[[ -s $d/fit.json ]] || rm -f $d/fit.json
echo "${d:h:t}/${d:t}: $(jq -r '.verdict + " " + .reason' $d/fit.json 2>/dev/null)"; rm -rf $tmp
