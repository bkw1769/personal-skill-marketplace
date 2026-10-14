#!/bin/zsh
# Generate the sheets of a batch.json (written by assemble-prompts.mjs) with Codex CLI image generation,
# in order, skipping sheets whose PNG already exists.
#   run-batch.sh <sheets dir> [name ...]          (no names = every sheet in batch.json)
# Needs `codex` (npm @openai/codex >= 0.161) logged in. References: names are looked up in batch.json
# refs_dirs; "@<sheet>" means a sheet of this batch (e.g. the day plate). Each image is taken from the
# run's own log (codex-image.mjs), never the newest PNG overall: other Codex sessions write to the same
# folder. Every capture is logged as "<sheet> <- <path>" in sources.txt. Look at each sheet as it lands.
set -e
SKILL=${0:A:h}
HERE=${1:A}
[[ -f "$HERE/batch.json" ]] || { echo "usage: run-batch.sh <sheets dir with batch.json> [name ...]" >&2; exit 1; }
shift
names=("$@")
[[ ${#names} -eq 0 ]] && names=($(node -e "console.log(require('$HERE/batch.json').items.map(i=>i.name).join(' '))"))
for n in $names; do
  out="$HERE/$n.png"
  if [[ -f "$out" ]]; then echo "skip $n (exists)"; continue; fi
  args=()
  for r in $(node -e "const b=require('$HERE/batch.json');const i=b.items.find(i=>i.name==='$n');if(!i){console.error('not in batch: $n');process.exit(1)}console.log(i.refs.join(' '))"); do
    if [[ $r == @* ]]; then f="$HERE/${r#@}.png"; else
      f=""; for d in $(node -e "console.log(require('$HERE/batch.json').refs_dirs.join(' '))"); do [[ -f "$d/$r" ]] && f="$d/$r" && break; done
    fi
    [[ -f "$f" ]] || { echo "missing reference $r for $n" >&2; exit 1; }
    args+=(-i "$f")
  done
  echo "generate $n (${#args} args)"
  img=""
  for attempt in 1 2 3 4; do
    codex exec --skip-git-repo-check -s read-only -C "$HERE" $args - < "$HERE/prompts/$n.txt" > "$HERE/logs-$n.txt" 2>&1 || true
    img=$(node "$SKILL/codex-image.mjs" "$HERE/logs-$n.txt" 2>/dev/null) || img=""
    [[ -n "$img" ]] && break
    echo "  attempt $attempt failed for $n ($(grep -m1 -o 'ERROR:.*' "$HERE/logs-$n.txt")), retrying in 60s"
    sleep 60
  done
  [[ -n "$img" ]] || { echo "no image produced for $n, skipping (see logs-$n.txt)" >&2; continue; }
  cp "$img" "$out"; echo "$n <- $img" >> "$HERE/sources.txt"
done
