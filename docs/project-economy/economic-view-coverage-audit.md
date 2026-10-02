# Economic view coverage audit and next read-only delivery

Status: SOURCE audit and implementation proposal only. No panel, SQL, gate, calculator, official cost, billing, provider, deployment or workflow changed. The October project-economy ownership contract supersedes older Finance calculator descriptions: Operations owns cost calculation and operational forecasting; Finance validates and copies Operations amounts.

## Pinned source and proof scope

| Source | Exact revision |
| --- | --- |
| Operations candidate, PR48 | `fc926d2a8a337ea42a3168912bbbaa56eff22898` |
| Finance candidate, PR55 | `5aabc3de292cfece3cdead472aed320bb235e15d` |
| Canonical plan | Finance `docs/project-economy/PLAN.md` at that Finance revision |
| Program skill | `advance-eventflow-project-economy`, including `delivery-plan.md` and `verification.md` |

Read the actual repository AGENTS, Finance skill, Finance architecture/delivery/acceptance/checkpoint, installed reporting-system contracts, exact component/route/helper sources and the scope/forecast/destination contracts. This is a generic source audit, not an organization-specific financial report or a new policy/target.

The independently led program's actual mounted Operations gate on the pinned Operations revision is run `36993747796`, job `110795626685`: disabled 2, scope-only 3, enabled 11 cases, all 13 workflow jobs successful. That proof covers a synthetic signed actor JWT, actual PostgreSQL/PostgREST and compiled route, copied evidence, null costs, authorization, refetch/privacy and unchanged economic evidence. It does not establish GoTrue login, hosted activation, upstream completeness, Fortnox/device/provider acceptance or a complete project forecast. No new runtime proof is claimed by this audit.

## Actual current presentation

| Surface / exact source | What it displays | What “complete” can mean | Missing project-level meaning |
| --- | --- | --- | --- |
| Operations `ProjectEconomyTab.tsx` | Existing Intäkt, Total kostnad, TB/Marginal; legacy summary and actions; then separate new evidence panels | Existing legacy signal model only | Those headlines are not tied to the new saved scope's category coverage or source-currentness. Their coexistence is a presentation gap, not proof that their historical amounts are wrong. |
| Operations `OperationsScopeObligationEvidencePanel.tsx` | Saved manual estimates/commitments, categories, saved source observations, saved revision/time and selected-row drilldown | Its reference-currentness flags concern captured membership/baselines/sources | Explicitly says full costs are unverified and forecast/budget/margin unavailable. It mounts only a project root although the reader supports three root kinds. No full-scope invoice capture UI is mounted here. |
| Operations `OperationsObligationDrilldownPanel.tsx` | Exact selected saved baseline and resolved positive invoice observations; linked replacement/commitment dispositions | Current policy under exact displayed composition and actual obligation authority | It expressly withholds personnel/Catering/credit completeness and forecast/budget/margin. It is not a whole-scope subtotal. |
| Operations `ProjectCostEvidencePanel.tsx` | Time-derived Operations personnel rows, Finance receipt state and received invoice allocations | Received/project-filtered rows, not full scope | No aggregate all-category coverage, source inventory timestamp or budget/remaining/EAC. Personnel confirmation/Finance acknowledgment are separate evidence, not cost-source completeness. |
| Operations `OperationsCateringEvidenceParityPanel.tsx` | Known copied preliminary/confirmed Catering subtotals, missing cost, separate Time/project review, opaque historic withdrawals | Received active rows only | Source full currentness is explicitly unverified; no extra project cost or whole forecast. “Catering” here is native time-cost evidence, not proof that ingredients or supplier obligations are complete. |
| Finance `projekt.$projectId.tsx` | Existing project projection EAC/ETC/TB and cost-line breakdown plus separate evidence panels | Existing active/final projection integrity rules | Neither the three component panels nor new whole-scope destination metadata selects an Operations-owned full-scope result for these legacy headlines. No new cross-module coverage implication is authorized. |
| Finance `OperationsPersonnelEvidencePanel.tsx` | Copied amount/minutes/status, immutable Time/cost versions, receipt date, missing rates/unbound evidence | “Mottaget underlag komplett” means its current received ledger has no known missing/unbound cost | It does not prove that every upstream Time stream, hired-personnel obligation or project cost has arrived. It lacks the explicit received-only/upstream-unverified explanation already used by Catering. |
| Finance `OperationsCateringEvidencePanel.tsx` | Same saved Operations money with independent source/project status, missing amounts and withdrawals | Received active rows only | Explicit upstream-unverified/no-extra-cost/no-forecast caveat. No ingredient, entire Catering budget or whole-scope completeness claim. |
| Finance `ProjectInvoiceEvidencePanel.tsx` | Saved project allocations before approval, confirmation of the same amount, credits, accounting/payment separately | Published allocation evidence, subject to limited documents/currentness/epoch | Mirror-as-of does not verify Fortnox census. Pending/failed org intents, changed source, unallocated amounts and unresolved credits retain known amounts while withholding full totals. |

Source blob pins: Operations scope panel `93a0f45eb4e981193acb1ea23700bbabe09eecaa`; drilldown `c60ad62ff8fc158728454b9c6d32ad581f729773`; cost evidence `5dccb24be910ff239c02f0f7458d20b851b4ac71`; Catering `b81c4129a57cb2eb170ce1337aee4107c9514d01`; economy route `aa1d68cc7344c28f693e33d3657f1ea6af4eb654`. Finance personnel `ef54d5df7ab1b63651a8ddd971cc58896abcc6be`; Catering `a7b724483c8a74e81e9151f5627dab37f8d1f572`; invoices `4bec456c95cebdc03c4b16a79d21d26ed6754551`; project route `83dbff92aad232bbd5ca56f1d31ef7c37da82408`.

## Gaps ranked by safe next action

1. **No one coverage explanation beside the new evidence.** Four individually useful datasets can be mistaken for a complete cost inventory. Add a read-only overview of each dataset's supported scope and missing/received-only state. All green component states must still leave whole-project coverage unknown.
2. **Legacy headline basis is not the new basis.** Put a clear contextual explanation with the gated overview: “Underlagen nedan är separata från den befintliga ekonomisammanställningen. Alla projektets kostnader är ännu inte verifierade.” Preserve the historical headlines, arithmetic, exports and actions in this first slice. A future headline authority cutover needs its own release/backfill/rollback and source-coverage gates; this audit does not authorize it.
3. **Whole-scope current invoice capture is readable but not visible.** The actual authenticated `read_operations_scope_invoice_capture_admin_v1(p_request)` and `projectScopeInvoiceCapture.ts` already bind the exact displayed immutable composition. Show that capture inside the same saved-scope panel, not as a competing manual/invoice total.
4. **Received-complete wording is inconsistent.** Add the personnel-specific received-only explanation; retain native status labels. Do not change SQL `complete` to imply upstream verification, or turn no-evidence/rejected-only into a zero subtotal.
5. **Family coverage remains unsupported.** Hired time needs authenticated basis/relationship dispositions; Catering ingredients need actual obligation/source inventory; credits need exact original allocation and accepted scope integration. Display their missing support rather than classify suppliers/people from labels or double-charge Time and invoice amounts.
6. **Cross-module whole scope is not delivered.** Finance's new whole-scope destination authority is metadata only. The source publication, transport, receiver and consuming read are not implemented by the inspected foundation. Do not assemble a Finance scope forecast from personnel/Catering/invoice component sums, child EACs or many-to-one legacy maps.
7. **Operating budget/revenue/forecast are distinct.** Actual immutable Booking commercial receipts are sales evidence, not an operating-cost budget. The isolated forecast contract is not activated source integration. Missing currency/unit/basis/version/member enrollment keeps budget, remaining, EAC and margin unavailable.
8. **Copied amount precision differs across Finance panels.** Personnel uses `formatFinanceMinor` from `src/finance/format.ts` (blob `0e2f581834190d1dac5ba016b54c4b89b50d932f`), whose formatter sets `maximumFractionDigits:0` and divides minor units by 100. Invoice/Catering use the narrow exact-cent formatter. Thus a valid 10001 minor-unit personnel row can display 100 kr while the same copied amount elsewhere displays 100,01 kr. This is a display-parity gap, not a changed stored amount. Propose a separately reviewed narrow evidence formatter reuse; do not modify global legacy formatting or use formatting arithmetic to repair ledger money.

No observed ledger gap justifies showing 0%, a 0 kr budget, an empty source list as a complete inventory, a default SEK conversion, or a full-cost percentage denominator.

## Next large safe UI delivery

Propose a two-stage vertical, with separate approval/ownership before code.

### A. Operations: one saved scope, explained coverage and current invoice capture

Reuse the existing saved-scope panel and its actual admin/session authority. A new read-only nested invoice view consumes the already-reviewed four-field request:

`{schema_version:'operations-scope-invoice-capture-admin-read.v1', root_kind, root_id, expected_composition_snapshot_id}`.

Selectors come only from the currently displayed accepted composition, never from a first child, an alias, caller actor/org, guessed booking or independently fetched amount. Reuse `readScopeInvoiceCapture`, strict admin evidence validation and the unchanged Operations `projectScopeInvoiceKernelEvidence` projection. No new pricing rule, client-owned kernel, aggregate writer, enrollment or parallel implementation is required.

Show:
- “Sparad uppskattning” / “Sparade åtaganden” as the existing saved manual basis.
- “Känt mottaget fakturabelopp”, preliminary/confirmed copied capture values and capture time, explicitly partial.
- Source diagnostics as bounded approved Swedish descriptions; no raw codes, raw invoices, IDs of other tenants, rates, people or arbitrary operator reasons.
- “Alla kostnader är ännu inte verifierade”; personnel, Catering, credits and other source coverage unavailable unless a separately reviewed source-owned capability proves otherwise.
- “Prognos saknas”, “Budget saknas”, “Marginal saknas”; exact null source values cannot acquire money or percentages in the view.

Known invoice values do not replace or get added to manual estimates in this view. The unchanged Operations projection owns any supported source disposition. An actual copied zero is distinct from null; an empty capture remains no known invoice subtotal. No combined “total cost” is produced.

Loading, timeout, PT409, changed displayed composition/membership, baseline conflict, admin/profile/root revoke and token/session switch hide the current invoice values, clear any expanded selection, and require a fresh accepted parent capture. Use the same opaque session boundary, gcTime 0, abort/post-session check and `meta.persist:false`. Default-off existing scope/leaf gates remain prerequisites; a read cannot enable them.

Source-owner handoff identified a separate queued-writer availability gap in the standalone capture reader's lock ordering. Its new `whole-scope-reader-lock-order-contract.md` audit/failfast protocol is in progress; it is not repaired by a panel or inherited from already-passed read cases. The new view must wait for source-owner compatible lock-entry review and native queued-writer/old-compose/same-transaction preview-enroll evidence before route acceptance or activation. Do not modify the frozen reader from this UI slice or translate real lock/serialization failures into complete/no-evidence states.

Reader supports project/large_project/packing_project, but current product mount only supplies project. Extend other actual root routes only after their canonical parent selectors and route authorization are separately audited; no first-child fallback.

### B. Finance: component coverage clarity, then true whole-scope copy

First independently add matching received-only explanations to the existing component presentation, without another money aggregation or changed legacy EAC. Auth/data-state errors must remain different from absent evidence. Do not show partner/private invoice-health counts to an unauthorized scope.

The eventual same whole-scope result requires actual Operations immutable publication, exact full-scope Finance entity/member mapping and current recipient sharing authority, signed transport/receipt, immutable destination capture, redacted authorized read and release gates. Only that consumer can display the same copied Operations projection. It remains partial invoice capture until the Operations source contract explicitly supports more categories. The Finance foundation alone is no activation/currentness authority.

## Proposed regression acceptance matrix

These are proposed tests, not executed audit results. New test-only files should be owned separately after root locks the UI slice; no tests that reproduce a new calculator.

| Case | Meaningful rendered/native result |
| --- | --- |
| Scope disabled / invoice details disabled | No new read or new money; legacy headline/exports/billing untouched |
| Saved manual 5000 and invoice 5400 | Two explicitly different bases; no 10400 total and no invented EAC |
| Received personnel/Catering/invoices all “complete” | Overview still says whole costs/source coverage unverified; forecast/budget/margin unavailable |
| One incomplete rate, unmapped snapshot or failed publication | Exact supported reason; known copied values retained only in authorized accepted view; full total unavailable |
| No scope / no composition / empty invoice capture | Clear missing state, null subtotal/forecast/budget/margin; no zero inventory |
| Rejected-only / withdrawn A→B→B evidence | No active fake-zero subtotal and no other-project amount/source identity; existing immutable withdrawal behavior preserved |
| Genuine preliminary→confirmed and correction | Same copied money on review; new exact source version on correction; no duplicate cost |
| Current credit not supported / ingredients or hired basis unverified | Explicit partial category support; no guessed suppression or label classification |
| Two bookings/leaf projects in one scope | Exact full captured member inventory and single source-owned subtotal; no sum of independently scoped EACs |
| PT409 displayed token or membership changed | Old money hidden; reload explanation; no latest capture under stale composition |
| Role/project/profile revoke, token/logout/root change | Actual denied read; loaded view unmounted and cache cleared; no financial query persistence or stale fallback |
| Mixed currency / unknown budget currency/basis | Per-source currency; no conversion or revenue-as-budget |
| Exact copied minor amount across panels | 10001, negative credit cents and near-safe-integer supported values preserve exact currency cents in evidence views; legacy headline formatting unchanged |
| Active vs closed legacy project | Existing final-snapshot/integrity safeguards preserved; partial new evidence never repairs a missing final result |
| Actual app-route read | Genuine signed actor JWT→PostgREST→actual scope/capture SQL; untouched body to strict parser; no mocked finance response or service-role read |
| Native competing source/policy/membership writers | Existing source barriers and stale/CAS tests; no claim from DOM fixtures alone |
| No financial/provider writes | Exact read allowlist, economic evidence state unchanged and owned process cleanup; preserve current native 2/3/11 journey |

Native authenticated capture reads and the current mounted drilldown proof are existing prerequisites, not proof of a not-yet-mounted new invoice summary. New source/renderer/actual-route tests and exact CI must close that gap. Preview/release/rollback/hosted/user/device/provider gates stay separately visible.

## Ownership and handoff

This audit owns this NEW document only. Existing components/helpers, canonical PLAN/CHECKPOINT, migrations, runners, workflows and destination authority are untouched. The next implementation requires root to reserve the exact nested view/model/tests and existing parent insertion, coordinate the whole-scope source owner and independent reviewer, pin real candidate sources again, then commit the reviewed default-off slice. Do not run a competing implementation or change established atomic/billing/official cost writers.
