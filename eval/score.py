# usage: python3 -I eval/score.py <N> [arm ...]; one table per model: per prompt and arm, the first N runs:
# distinct answers (judge-set.sh), still the brief (judge-fit.sh), tool called, median output tokens and seconds, and both
# against plain on the same prompt. With no arms given, every arm that has a groups file for N.
import json, glob, os, sys, statistics as st
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
N = int(sys.argv[1]); want = sys.argv[2:]
prompts = [l.split("\t") for l in open(f"{R}/eval/prompts.tsv").read().splitlines() if l.strip()]
def load(p):
    try: return json.load(open(p))
    except Exception: return None
def stats(model, pid, arm):
    ds = sorted(glob.glob(f"{R}/eval/runs/{model}/{pid}/{arm}-[0-9][0-9]"))[:N]
    ds = [d for d in ds if os.path.exists(f"{d}/reply.txt")]
    if not ds: return None
    g = load(f"{R}/eval/runs/{model}/{pid}/{arm}.groups-{N}.json") or {}
    fit = [load(f"{d}/fit.json") or {} for d in ds]
    tok = [(load(f"{d}/cost.json") or {}).get("output_tokens") or 0 for d in ds]
    sec = [int(open(f"{d}/seconds.txt").read()) for d in ds if os.path.exists(f"{d}/seconds.txt")]
    called = sum(1 for d in ds if os.path.exists(f"{d}/seed.txt") and os.path.getsize(f"{d}/seed.txt"))
    return dict(n=len(ds), distinct=g.get("distinct"), fit=sum(f.get("verdict") == "PASS" for f in fit), judged=sum(bool(f) for f in fit),
                tok=st.median(tok), sec=st.median(sec) if sec else 0, called=called)
for model in [m for m in ["opus-5.5", "fable-5.1", "gpt-6.1-sol", "gpt-6-astra"] if os.path.isdir(f"{R}/eval/runs/{m}")]:
    print(f"\n### {model}, first {N} runs per arm\n")
    print("| Prompt | Arm | Distinct | Still the brief | Called | Output tokens (median) | × plain | Seconds (median) | × plain |")
    print("|---|---|---|---|---|---|---|---|---|")
    tot = {}
    for pid, kind, role, _ in prompts:
        base = stats(model, pid, "plain")
        arms = want or sorted({os.path.basename(p).split(".groups")[0] for p in glob.glob(f"{R}/eval/runs/{model}/{pid}/*.groups-{N}.json")}, key=lambda a: (a != "plain", a))
        for arm in arms:
            s = stats(model, pid, arm)
            if not s: continue
            rt = s["tok"] / base["tok"] if base and base["tok"] else 0; rs = s["sec"] / base["sec"] if base and base["sec"] else 0
            t = tot.setdefault(arm, [0, 0, 0, 0, [], []])
            t[0] += s["distinct"] or 0; t[1] += s["n"]; t[2] += s["fit"]; t[3] += s["judged"]; t[4].append(rt); t[5].append(rs)
            print(f"| {pid}{' (held out)' if role == 'holdout' else ''} | {arm} | {s['distinct'] if s['distinct'] is not None else '?'} of {s['n']} | {s['fit']} of {s['judged']} | {'-' if arm == 'plain' else s['called']} | {s['tok']:.0f} | {rt:.1f}× | {s['sec']:.0f} | {rs:.1f}× |")
    for arm, (d, n, f, j, rt, rs) in tot.items():
        print(f"| **all** | **{arm}** | **{d} of {n}** | {f} of {j} | | | {st.median(rt):.1f}× | | {st.median(rs):.1f}× |")
