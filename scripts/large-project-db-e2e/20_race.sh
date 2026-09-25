#!/usr/bin/env bash
# Samtidighetstester (race) mot ISOLERAD lokal Postgres. Anropas av run.sh
# med $P (psql-kommando) och en nyseedad databas "lp".
set -uo pipefail
P="$1"; OUT="$2"
UA="00000000-0000-0000-0000-00000000000a"
P1=11111111-0000-0000-0000-000000000001; P2=11111111-0000-0000-0000-000000000002
as_user="SELECT set_config('request.jwt.claim.sub','$UA',true); SET LOCAL ROLE authenticated;"
res() { echo "$1 | $2 | $3" | tee -a "$OUT"; }

# R1: två sessioner kopplar SAMMA bokning till OLIKA projekt samtidigt.
( $P -d lp -tA -c "BEGIN; $as_user SELECT link_booking_to_large_project('$P1','e2e-a3',false); SELECT pg_sleep(2); COMMIT;" >/tmp/lpdb/r1a.log 2>&1 ) &
sleep 0.5
start=$(date +%s.%N)
$P -d lp -tA -c "BEGIN; $as_user SELECT link_booking_to_large_project('$P2','e2e-a3',false); COMMIT;" >/tmp/lpdb/r1b.log 2>&1; rc=$?
waited=$(echo "$(date +%s.%N) - $start" | bc)
wait
n=$($P -d lp -tA -c "select count(*) from large_project_bookings where booking_id='e2e-a3'")
lp=$($P -d lp -tA -c "select large_project_id from bookings where id='e2e-a3'")
ok=false; [ $rc -ne 0 ] && grep -q BOOKING_IN_OTHER_PROJECT /tmp/lpdb/r1b.log && [ "$n" = 1 ] && [ "$lp" = "$P1" ] && ok=true
res "$([ $ok = true ] && echo PASS || echo FAIL)" "R1 race olika projekt: andra väntar på låset och avvisas, exakt 1 länk" "väntade ${waited}s, länkar=$n"

# R2: två sessioner kopplar SAMMA bokning till SAMMA projekt samtidigt.
( $P -d lp -tA -c "BEGIN; $as_user SELECT link_booking_to_large_project('$P1','e2e-a2',false); SELECT pg_sleep(2); COMMIT;" >/tmp/lpdb/r2a.log 2>&1 ) &
sleep 0.5
$P -d lp -tA -c "BEGIN; $as_user SELECT link_booking_to_large_project('$P1','e2e-a2',false); COMMIT;" >/tmp/lpdb/r2b.log 2>&1; rc2=$?
wait
n2=$($P -d lp -tA -c "select count(*) from large_project_bookings where booking_id='e2e-a2'")
ok2=false; [ $rc2 -eq 0 ] && [ "$n2" = 1 ] && ok2=true
res "$([ $ok2 = true ] && echo PASS || echo FAIL)" "R2 race samma projekt: båda lyckas, ingen dubblett" "länkar=$n2"
