#!/usr/bin/env bash
# Junta todas as migrations (em ordem) + as categorias base num SQL só, pra
# colar no SQL Editor de um Supabase NOVO. Uso:
#   bash scripts/instalacao-sql.sh | pbcopy
set -euo pipefail
cd "$(dirname "$0")/../supabase"
for f in migrations/*.sql seed.sql; do
  printf -- '-- ===== %s =====\n' "$f"
  cat "$f"
  printf '\n'
done
