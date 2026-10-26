#!/bin/zsh
# usage: eval/judge-all.sh <N> [arm ...]; judges every finished run (fit, 8 at a time), then every arm's first N runs as a set
# (4 at a time). Arms default to all; plain is always judged too. Skips what is already judged.
S=${0:A:h:h}; N=$1; shift; arms=($@)
cd $S/eval/runs
for d in */*/*-[0-9][0-9]; do a=${${d:t}%-*}; (( $#arms )) && [[ $a != plain && ${arms[(Ie)$a]} == 0 ]] && continue; echo $S/eval/runs/$d; done | xargs -P 8 -n 1 $S/eval/judge-fit.sh
for p in */*; do for a in $(ls $p | grep -E -- '-[0-9]{2}$' | sed -E 's/-[0-9]{2}$//' | sort -u); do
  (( $#arms )) && [[ $a != plain && ${arms[(Ie)$a]} == 0 ]] && continue
  (( $(ls -d $p/$a-[0-9][0-9] | wc -l) >= N )) && echo "${p%%/*} ${p#*/} $a $N"
done; done | xargs -P 4 -L 1 $S/eval/judge-set.sh
