#!/usr/bin/env bash
# Runs the database migration and security tests against a throwaway local Postgres.
set -euo pipefail
cd "$(dirname "$0")/.."
PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)}"
DIR="$(mktemp -d)"
RUN=()
if [ "$(id -u)" = 0 ]; then chown postgres "$DIR"; RUN=(runuser -u postgres --); fi
cleanup() { "${RUN[@]}" "$PG_BIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
"${RUN[@]}" "$PG_BIN/initdb" -D "$DIR/data" -U postgres >/dev/null
"${RUN[@]}" "$PG_BIN/pg_ctl" -D "$DIR/data" -o "-k $DIR -c listen_addresses=''" -l "$DIR/log" -w start >/dev/null
PSQL=("${RUN[@]}" "$PG_BIN/psql" -h "$DIR" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -f supabase/tests/supabase_stub.sql
"${PSQL[@]}" -f supabase/migrations/0001_advisor_cards.sql
"${PSQL[@]}" -f supabase/tests/security_test.sql
echo "All database tests passed."
