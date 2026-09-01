#!/usr/bin/env bash
# SCANNER HARDENING – STEG 15B: kör scanner E2E reliability gate.
#
# Fail-closed: utan godkänd LOCAL/TEST-miljö + 15A-fixtures aborteras körningen
# innan någon mutation sker (exit 10), eller vid produktionsmarkör (exit 20).
#
# Krävda variabler (sätts lokalt, ALDRIG i repot):
#   SCANNER_E2E_SAFE_TEST_ENV=true
#   SCANNER_E2E_ENVIRONMENT=local|test
#   SCANNER_E2E_WMS_URL=<15A read-only WMS control/state endpoint>
#   SCANNER_E2E_WMS_APPROVED_TEST_TARGET=true
#   SCANNER_E2E_PLANNING_URL=<Planning scanner-operation-v2 test endpoint>
#   SCANNER_E2E_ENABLE_V2_FOR_RUN=true
#   SCANNER_E2E_ALLOW_MUTATIONS=true
#   SCANNER_E2E_FIXTURE_ORG_ID=fixture-...
#   SCANNER_E2E_RUN_ID=scanner-e2e-<unikt>
#   SCANNER_E2E_AUTH_TOKEN=<active mobile test-session token>
#   SCANNER_E2E_FIXTURES_JSON='{"packingId":"...","packingSessionId":"...","bookingNumber":"...","reservationId":"...","quantityItemId":"...","quantityReservationLineId":"...","serialItemId":"...","serialReservationLineId":"...","serialValue":"...","returnItemId":"...","returnReservationLineId":"...","returnSerialValue":"..."}'
set -uo pipefail
bun run scripts/scanner-e2e/run.ts
exit $?
