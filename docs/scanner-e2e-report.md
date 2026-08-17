# SCANNER HARDENING – STEG 15B: FULL SCANNER E2E RELIABILITY GATE

Genererad: 2026-08-17T12:32:34.188Z
Run-id: (inget)
Slutstatus: **NOT GREEN**

## Preflight (fail-closed)

| Kontroll | Status | Detalj |
|---|---|---|
| Explicit bekräftelse SCANNER_E2E_SAFE_TEST_ENV=true | BLOCKERAD | saknas |
| Environment är LOCAL eller TEST | BLOCKERAD | saknas |
| WMS target är uttryckligen godkänd testmiljö | BLOCKERAD | url saknas |
| Planning target är test/local | BLOCKERAD | saknas |
| SCANNER_TRANSACTION_V2 aktiveras endast för denna testkörning | BLOCKERAD | saknas |
| Scanner-mutationer kräver explicit opt-in | BLOCKERAD | saknas |
| Test organization är fixture-org | BLOCKERAD | saknas |
| Inga produktionsidentifierare förekommer | OK | inga |
| Run-id är unikt och satt | BLOCKERAD | saknas |

**ABORT:** SAFE TEST CONFIGURATION NOT PROVIDED (safe_env_flag, environment_local_or_test, wms_target_approved, planning_target_test, v2_enabled_for_run_only, mutations_opt_in, fixture_org, unique_run_id)

**NO MUTATIONS EXECUTED**

## Scenarier

| # | Scenario | Obligatoriskt | Status | Orsak |
|---|---|---|---|---|
| 3 | Exakt ett operation_id per fysisk scan | ja | NOT_EXECUTED | preflight abort: SAFE TEST CONFIGURATION NOT PROVIDED (safe_env_flag, environment_local_or_test, wms_target_approved, planning_target_test, v2_enabled_for_run_only, mutations_opt_in, fixture_org, unique_run_id) |
| 4 | Queue Fall A – offline ger PENDING och persisteras | ja | NOT_EXECUTED | preflight abort: SAFE TEST CONFIGURATION NOT PROVIDED (safe_env_flag, environment_local_or_test, wms_target_approved, planning_target_test, v2_enabled_for_run_only, mutations_opt_in, fixture_org, unique_run_id) |
| 4 | Queue Fall B – reload behåller operation och samma id | ja | NOT_EXECUTED | preflight abort: SAFE TEST CONFIGURATION NOT PROVIDED (safe_env_flag, environment_local_or_test, wms_target_approved, planning_target_test, v2_enabled_for_run_only, mutations_opt_in, fixture_org, unique_run_id) |
| 4 | Queue Fall C – server nere skapar aldrig ny operation | ja | NOT_EXECUTED | preflight abort: SAFE TEST CONFIGURATION NOT PROVIDED (safe_env_flag, environment_local_or_test, wms_target_approved, planning_target_test, v2_enabled_for_run_only, mutations_opt_in, fixture_org, unique_run_id) |
| 5 | Nätfel före WMS – ingen lokal mutation, samma id vid retry | ja | NOT_EXECUTED | preflight abort: SAFE TEST CONFIGURATION NOT PROVIDED (safe_env_flag, environment_local_or_test, wms_target_approved, planning_target_test, v2_enabled_for_run_only, mutations_opt_in, fixture_org, unique_run_id) |
| 6 | Commit men förlorat svar → UNKNOWN → ALREADY_COMMITTED, en mutation | ja | NOT_EXECUTED | preflight abort: SAFE TEST CONFIGURATION NOT PROVIDED (safe_env_flag, environment_local_or_test, wms_target_approved, planning_target_test, v2_enabled_for_run_only, mutations_opt_in, fixture_org, unique_run_id) |
| 7 | Kvantitet 0→1, 10 scans, −3 = 7 (authoritative) | ja | NOT_EXECUTED | preflight abort: SAFE TEST CONFIGURATION NOT PROVIDED (safe_env_flag, environment_local_or_test, wms_target_approved, planning_target_test, v2_enabled_for_run_only, mutations_opt_in, fixture_org, unique_run_id) |
| 8 | Två devices +1 vardera = +2 | ja | NOT_EXECUTED | preflight abort: SAFE TEST CONFIGURATION NOT PROVIDED (safe_env_flag, environment_local_or_test, wms_target_approved, planning_target_test, v2_enabled_for_run_only, mutations_opt_in, fixture_org, unique_run_id) |
| 8 | Två devices samma serial → en COMMITTED, en CONFLICT | ja | NOT_EXECUTED | preflight abort: SAFE TEST CONFIGURATION NOT PROVIDED (safe_env_flag, environment_local_or_test, wms_target_approved, planning_target_test, v2_enabled_for_run_only, mutations_opt_in, fixture_org, unique_run_id) |
| 9 | PACK/UNPACK_INSTANCE på rätt bokning | ja | NOT_EXECUTED | preflight abort: SAFE TEST CONFIGURATION NOT PROVIDED (safe_env_flag, environment_local_or_test, wms_target_approved, planning_target_test, v2_enabled_for_run_only, mutations_opt_in, fixture_org, unique_run_id) |
| 9 | UNPACK från fel bokning avvisas utan mutation | ja | NOT_EXECUTED | preflight abort: SAFE TEST CONFIGURATION NOT PROVIDED (safe_env_flag, environment_local_or_test, wms_target_approved, planning_target_test, v2_enabled_for_run_only, mutations_opt_in, fixture_org, unique_run_id) |
| 10 | RETURN_INSTANCE rätt/fel bokning (separat från unpack) | ja | NOT_EXECUTED | preflight abort: SAFE TEST CONFIGURATION NOT PROVIDED (safe_env_flag, environment_local_or_test, wms_target_approved, planning_target_test, v2_enabled_for_run_only, mutations_opt_in, fixture_org, unique_run_id) |
| 11 | Overpack ger OVER_CAPACITY utan lokal ökning | ja | NOT_EXECUTED | preflight abort: SAFE TEST CONFIGURATION NOT PROVIDED (safe_env_flag, environment_local_or_test, wms_target_approved, planning_target_test, v2_enabled_for_run_only, mutations_opt_in, fixture_org, unique_run_id) |
| 12 | Okänd produkt – noll mutation, ingen dold allocation efter avbryt | ja | NOT_EXECUTED | preflight abort: SAFE TEST CONFIGURATION NOT PROVIDED (safe_env_flag, environment_local_or_test, wms_target_approved, planning_target_test, v2_enabled_for_run_only, mutations_opt_in, fixture_org, unique_run_id) |
| 13 | Tvetydigt serienummer avvisas utan mutation | ja | NOT_EXECUTED | preflight abort: SAFE TEST CONFIGURATION NOT PROVIDED (safe_env_flag, environment_local_or_test, wms_target_approved, planning_target_test, v2_enabled_for_run_only, mutations_opt_in, fixture_org, unique_run_id) |
| 14 | UI-transitions + grönt endast vid COMMITTED/ALREADY_COMMITTED | ja | NOT_EXECUTED | preflight abort: SAFE TEST CONFIGURATION NOT PROVIDED (safe_env_flag, environment_local_or_test, wms_target_approved, planning_target_test, v2_enabled_for_run_only, mutations_opt_in, fixture_org, unique_run_id) |
| 15 | Listener ready ≠ hardware scanner ready | ja | NOT_EXECUTED | preflight abort: SAFE TEST CONFIGURATION NOT PROVIDED (safe_env_flag, environment_local_or_test, wms_target_approved, planning_target_test, v2_enabled_for_run_only, mutations_opt_in, fixture_org, unique_run_id) |
| 16 | Keyboard fallback går genom kö + V2 gateway med bevarad source | ja | NOT_EXECUTED | preflight abort: SAFE TEST CONFIGURATION NOT PROVIDED (safe_env_flag, environment_local_or_test, wms_target_approved, planning_target_test, v2_enabled_for_run_only, mutations_opt_in, fixture_org, unique_run_id) |
| 17 | RFID source bevaras; PACK→UNPACK samma EPC dedupas inte bort | ja | NOT_EXECUTED | preflight abort: SAFE TEST CONFIGURATION NOT PROVIDED (safe_env_flag, environment_local_or_test, wms_target_approved, planning_target_test, v2_enabled_for_run_only, mutations_opt_in, fixture_org, unique_run_id) |
| 18 | Reload under SENDING → UNKNOWN, ingen dubbelmutation | ja | NOT_EXECUTED | preflight abort: SAFE TEST CONFIGURATION NOT PROVIDED (safe_env_flag, environment_local_or_test, wms_target_approved, planning_target_test, v2_enabled_for_run_only, mutations_opt_in, fixture_org, unique_run_id) |
| 19 | Stale projection 4, WMS 7 → Planning blir 7 (ingen +1-matematik) | ja | NOT_EXECUTED | preflight abort: SAFE TEST CONFIGURATION NOT PROVIDED (safe_env_flag, environment_local_or_test, wms_target_approved, planning_target_test, v2_enabled_for_run_only, mutations_opt_in, fixture_org, unique_run_id) |
| 20 | V2-operation träffar aldrig legacy write-path | ja | NOT_EXECUTED | preflight abort: SAFE TEST CONFIGURATION NOT PROVIDED (safe_env_flag, environment_local_or_test, wms_target_approved, planning_target_test, v2_enabled_for_run_only, mutations_opt_in, fixture_org, unique_run_id) |
| 21 | Org A kan inte scanna org B:s fixture | ja | NOT_EXECUTED | preflight abort: SAFE TEST CONFIGURATION NOT PROVIDED (safe_env_flag, environment_local_or_test, wms_target_approved, planning_target_test, v2_enabled_for_run_only, mutations_opt_in, fixture_org, unique_run_id) |
| 22 | Cross-system reconciliation utan mismatch efter sviten | ja | NOT_EXECUTED | preflight abort: SAFE TEST CONFIGURATION NOT PROVIDED (safe_env_flag, environment_local_or_test, wms_target_approved, planning_target_test, v2_enabled_for_run_only, mutations_opt_in, fixture_org, unique_run_id) |

## Regel

NOT_EXECUTED räknas ALDRIG som PASS. Sviten är GREEN endast när samtliga
obligatoriska scenarier är PASS.
