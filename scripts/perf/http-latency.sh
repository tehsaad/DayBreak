#!/bin/bash
# Usage: scripts/perf/http-latency.sh [BASE_URL] [N]. Reports median and p95 of total request time
# (curl time_total, network included) for public routes. With N=15, p95 is the slowest request.
# median and p95 of total time over N requests per path
B=${1:-https://daybreak-gilt.vercel.app}; N=${2:-15}
for p in / /login /api/health /api/news/status /explore; do
  for i in $(seq $N); do curl -s -o /dev/null -w "%{time_total}\n" "$B$p"; done | sort -n | awk -v p="$p" '{a[NR]=$1} END{printf "%-18s median %4.0f ms  p95 %4.0f ms\n", p, a[int((NR+1)/2)]*1000, a[int(NR*0.95+0.999)]*1000}'
done
