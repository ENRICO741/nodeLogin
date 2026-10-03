#!/bin/bash
cmd=$(jq -r '.tool_input.command // empty')
[ -z "$cmd" ] && exit 0

patterns=(
  '(^|[[:space:];&|])rm[[:space:]]+(-[^[:space:]]+[[:space:]]+)*-[^[:space:]]*[rR][^[:space:]]*[[:space:]]+(-[^[:space:]]+[[:space:]]+)*(/|/\*|~|~/|~/\*|\*|\.|\./|\.\.|\$HOME|/c|/c/)([[:space:];&|]|$)'
  'az[[:space:]]+group[[:space:]]+delete'
  'terraform[[:space:]]+destroy'
)

for p in "${patterns[@]}"; do
  if printf '%s' "$cmd" | grep -Eq -- "$p"; then
    echo "Bloqueado pelo hook de seguranca: $cmd" >&2
    exit 2
  fi
done
exit 0