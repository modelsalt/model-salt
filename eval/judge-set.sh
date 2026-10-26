#!/bin/zsh
# usage: eval/judge-set.sh <model> <prompt> <arm> [first N, default 10]; how many different answers one arm gave
# -> eval/runs/<model>/<prompt>/<arm>.groups.json. Opus 5.5 (effort medium) sees the arm's answers shuffled under letters
# (renders for SVG tasks, the deliverables from fit.json for text) and groups the ones a user would call the same answer.
# "distinct" is the number of groups. Each arm is judged alone and blind to the arm's name.
S=${0:A:h:h}; key=$1; pid=$2; arm=$3; N=${4:-10}; P=$S/eval/runs/$key/$pid; out=$P/$arm.groups-$N.json
[[ -s $out ]] && exit 0
dirs=(${(f)"$(ls -d $P/$arm-[0-9][0-9] | head -$N)"}); tmp=$(mktemp -d); cd $tmp
# a run made by the site queue's workers has no render.png (their image has no rsvg-convert): drawn here, as eval/run.sh draws it
for d in $dirs; do [[ -s $d/image.svg && ! -s $d/render.png ]] && rsvg-convert -w 600 -h 450 -a -b white $d/image.svg -o $d/render.png 2>/dev/null; done
kind=$(awk -F'\t' -v p=$pid '$1==p{print $2}' $S/eval/prompts.tsv); brief=$(awk -F'\t' -v p=$pid '$1==p{print $4}' $S/eval/prompts.tsv)
python3 -I - $tmp $kind ${dirs[@]} <<'PY'
import sys, json, random, os, string
tmp, kind, dirs = sys.argv[1], sys.argv[2], sys.argv[3:]
random.shuffle(dirs); key = {}; lines = []
for L, d in zip(string.ascii_uppercase, dirs):
    key[L] = os.path.basename(d)
    if kind == "svg":
        p = f"{d}/render.png"
        lines.append(f"{L}: {p}" if os.path.exists(p) else f"{L}: (no image)")
    else:
        try: a = json.load(open(f"{d}/fit.json")).get("answer", "")
        except Exception: a = open(f"{d}/reply.txt").read()
        lines.append(f"--- {L} ---\n{a.strip()}")
json.dump(key, open(f"{tmp}/key.json", "w")); open(f"{tmp}/items.txt", "w").write("\n".join(lines))
PY
if [[ $kind == svg ]]; then
  how="Read every image listed below (one Read per file). Two pictures are the same answer if a viewer would call them the same picture in other colours: the same technique and look, the same viewpoint and pose, the same layout. A different colour scheme, sky or small props alone do not make a different answer."
else
  how="Two answers are the same answer if they rest on the same central idea, even when details, wording or mechanics differ: for a story the same premise (who, what happens, the turn), for a name and pitch the same name or the same theme, for a poem the same central image and angle. Count answers as different only when a reader would see a genuinely different idea."
fi
q="These are $#dirs answers to the request \"$brief\", from repeated runs. $how
Group them: every letter in exactly one group. Reply with only a JSON object: {\"groups\": [[\"A\", ...], ...], \"note\": \"under 25 words on what the biggest group shares\"}

$(<items.txt)"
${CLAUDE:-$HOME/.local/bin/claude} -p --model claude-opus-5-5 --effort medium --system-prompt "." --exclude-dynamic-system-prompt-sections \
  --tools Read --allowedTools Read --setting-sources "" --strict-mcp-config --no-session-persistence --output-format json "$q" > r.json 2>/dev/null
jq -r '.result' r.json | python3 -I -c "
import sys,json,re;t=sys.stdin.read();m=re.search(r'\{.*\}',t,re.S);key=json.load(open('key.json'))
g=json.loads(m.group(0));g['groups']=[[key[x] for x in grp if x in key] for grp in g['groups']];g['distinct']=len(g['groups']);g['n']=len(key)
print(json.dumps(g))" > $out
[[ -s $out ]] || rm -f $out
echo "$key/$pid/$arm: $(jq -r '"\(.distinct) of \(.n): \(.note)"' $out 2>/dev/null)"; rm -rf $tmp
