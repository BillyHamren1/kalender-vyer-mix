#!/usr/bin/env bash
# ============================================================================
# check-time-engine-clean.sh
# ----------------------------------------------------------------------------
# Hard guard: the new Time Engine flow MUST NOT write to legacy time tables.
#
# Allowed time-table writes in scoped files:
#   - active_time_registrations
#   - staff_location_history (GPS append)
#
# Forbidden writes (insert/update/upsert/delete) in scoped files:
#   - workdays
#   - location_time_entries
#   - time_reports
#   - travel_time_logs
#   - current_time_registration
#
# The mobile-app-api file is huge; we only scope the Time Engine actions:
#   start_time_registration, stop_time_registration, update_location
# (i.e. handleStartTimeRegistration / handleStopTimeRegistration /
#  handleUpdateLocation regions).
#
# Exit codes:
#   0 = clean
#   1 = forbidden write found
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; CLR=$'\033[0m'

FORBIDDEN_TABLES=(
  "workdays"
  "location_time_entries"
  "time_reports"
  "travel_time_logs"
  "current_time_registration"
)

# Files where every line must be clean.
FULL_FILES=(
  "supabase/functions/get-current-time-registration/index.ts"
  "supabase/functions/get-active-time-registration-status/index.ts"
  "supabase/functions/get-timer-time-segments/index.ts"
)

# Whole directory: every .ts file must be clean.
SCOPED_DIRS=(
  "supabase/functions/_shared/time-engine"
)

# mobile-app-api: only scoped functions.
MOBILE_API="supabase/functions/mobile-app-api/index.ts"
MOBILE_API_REGIONS=(
  "handleStartTimeRegistration"
  "handleStopTimeRegistration"
  "handleUpdateLocation"
  # also the inline geofence block lives inside report_location/update_location
  # which we cover by extracting handleUpdateLocation; if not found we still
  # check the geofence comment marker block below.
)

failures=0

# Build a single regex of "<table>.*(insert|update|upsert|delete)" matches —
# we look for `.from('<table>')` followed (within ~200 chars) by a write verb.
build_pattern() {
  local table="$1"
  # Match either:
  #   .from('table').insert/update/upsert/delete
  #   .from("table").insert/update/upsert/delete
  # Allow chained .select/.eq/etc. between .from and the write verb.
  printf "from\\(['\"]%s['\"]\\)[^;]{0,400}\\.(insert|update|upsert|delete)\\b" "$table"
}

scan_text() {
  local label="$1" text="$2"
  for table in "${FORBIDDEN_TABLES[@]}"; do
    local pattern; pattern="$(build_pattern "$table")"
    # Use perl for multi-line-ish chained regex (single line still common).
    if echo "$text" | perl -ne 'BEGIN{$/=undef} exit (m/'"$pattern"'/s ? 0 : 1)' >/dev/null 2>&1; then
      # Also extract a snippet for reporting.
      local snippet
      snippet="$(echo "$text" | perl -ne 'BEGIN{$/=undef} while(m/('"$pattern"')/sg){print "  ".$1."\n"}' | head -3)"
      echo "${RED}✗ ${label}${CLR} writes to forbidden table '${table}':"
      echo "$snippet"
      failures=$((failures + 1))
    fi
  done
}

scan_full_file() {
  local rel="$1"
  local path="${ROOT}/${rel}"
  if [[ ! -f "$path" ]]; then
    echo "${YEL}? skipping missing file:${CLR} $rel"
    return
  fi
  local text; text="$(cat "$path")"
  scan_text "$rel" "$text"
}

scan_dir() {
  local rel="$1"
  local dir="${ROOT}/${rel}"
  if [[ ! -d "$dir" ]]; then
    echo "${YEL}? skipping missing dir:${CLR} $rel"
    return
  fi
  while IFS= read -r -d '' f; do
    local rp="${f#$ROOT/}"
    local text; text="$(cat "$f")"
    scan_text "$rp" "$text"
  done < <(find "$dir" -type f -name "*.ts" -print0)
}

# Extract a function-region by name from a TS file. Stops at the next
# top-level `async function` / `function` declaration.
extract_region() {
  local path="$1" name="$2"
  perl -ne '
    BEGIN { $in=0; $depth=0; $printed=0; }
    if (!$in && /\b(?:async\s+)?function\s+'"$name"'\b/) { $in=1; }
    if ($in) { print; }
    if ($in && /\{/)  { $depth += () = $_ =~ /\{/g; }
    if ($in && /\}/)  { $depth -= () = $_ =~ /\}/g; if ($depth <= 0) { exit 0; } }
  ' "$path"
}

scan_mobile_api_regions() {
  local path="${ROOT}/${MOBILE_API}"
  if [[ ! -f "$path" ]]; then
    echo "${YEL}? skipping missing file:${CLR} $MOBILE_API"
    return
  fi
  for region in "${MOBILE_API_REGIONS[@]}"; do
    local text; text="$(extract_region "$path" "$region")"
    if [[ -z "$text" ]]; then
      # handleUpdateLocation may not exist as a named function — fall through
      # silently for that name. For the two registration handlers it MUST exist.
      if [[ "$region" == "handleStartTimeRegistration" || "$region" == "handleStopTimeRegistration" ]]; then
        echo "${RED}✗ region not found in $MOBILE_API: ${region}${CLR}"
        failures=$((failures + 1))
      fi
      continue
    fi
    scan_text "${MOBILE_API}::${region}" "$text"
  done

  # Extra sweep: the update_location action body lives inside a switch/case
  # and the geofence comment marker is unique. Extract from the marker until
  # the next top-level `async function` declaration.
  local geo_block
  geo_block="$(perl -ne '
    if (/TIME ENGINE v2: GPS-driven auto-start/) { $in=1; }
    if ($in) { print; }
    if ($in && /^async function /) { exit 0; }
  ' "$path")"
  if [[ -n "$geo_block" ]]; then
    scan_text "${MOBILE_API}::update_location(geofence+time-engine block)" "$geo_block"
  fi
}

echo "▶ Time Engine cleanliness check"
echo "  forbidden tables: ${FORBIDDEN_TABLES[*]}"
echo

for f in "${FULL_FILES[@]}"; do scan_full_file "$f"; done
for d in "${SCOPED_DIRS[@]}"; do scan_dir "$d"; done
scan_mobile_api_regions

echo
if (( failures > 0 )); then
  echo "${RED}FAIL${CLR}: ${failures} forbidden write(s) found in new Time Engine flow."
  exit 1
fi
echo "${GRN}OK${CLR}: new Time Engine flow only touches allowed tables."
