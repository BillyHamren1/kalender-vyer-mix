#!/usr/bin/env bash
# Verkliga Postgres-tester av link_booking_to_large_project mot en ISOLERAD,
# tillfällig lokal Postgres (aldrig produktion). Fixture-schema speglar
# produktionens typer; funktionen och grants kommer från de riktiga
# migreringsfilerna i supabase/migrations/.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR=/tmp/lpdb; PORT=55433
unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGSSLMODE
RUNAS=""; [ "$(id -u)" = 0 ] && RUNAS="setpriv --reuid=1000 --regid=1000 --clear-groups"
if [ ! -d "$DIR/data" ]; then
  mkdir -p "$DIR"; [ -n "$RUNAS" ] && chown 1000 "$DIR"
  $RUNAS initdb -D "$DIR/data" -U postgres -A trust >/dev/null
fi
$RUNAS pg_ctl -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=''" -l "$DIR/log" status >/dev/null 2>&1 \
  || $RUNAS pg_ctl -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=''" -l "$DIR/log" start >/dev/null
sleep 1
P="psql -h $DIR -p $PORT -U postgres -q -v ON_ERROR_STOP=1"
$P -c "drop database if exists lp" -c "create database lp"
H="$ROOT/scripts/large-project-db-e2e"
for f in "$H/00_fixture.sql" "$ROOT"/supabase/migrations/20260925103906_*.sql "$ROOT"/supabase/migrations/20260925104140_*.sql "$H/01_seed.sql"; do
  $P -d lp -f "$f"
done
$P -d lp -tA -F' | ' -f "$H/10_tests.sql" | grep -E '^(PASS|FAIL)' | tee "$DIR/results.txt"
# Samtidighetstester på nyseedad databas (egna sessioner krävs för låsning).
$P -c "drop database lp" -c "create database lp"
for f in "$H/00_fixture.sql" "$ROOT"/supabase/migrations/20260925103906_*.sql "$ROOT"/supabase/migrations/20260925104140_*.sql "$H/01_seed.sql"; do
  $P -d lp -f "$f"
done
bash "$H/20_race.sh" "$P" "$DIR/results.txt"
echo "TOTALT: $(grep -c '^PASS' "$DIR/results.txt") PASS, $(grep -c '^FAIL' "$DIR/results.txt") FAIL"
! grep -q '^FAIL' "$DIR/results.txt"
