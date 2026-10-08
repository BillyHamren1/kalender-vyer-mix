// Private fixture material only; never print these bodies in public CI logs.
import { verifyFrozenTimeSnapshot } from "../../supabase/functions/_shared/project-personnel-cost.ts";
import { validateProjectInvoiceDestination } from "../../supabase/functions/_shared/finance-project-invoice-destination.ts";
import { validateManualObligationBaselineCommand } from "../../supabase/functions/_shared/project-cost-obligation-authority.ts";
import { hiredPublicationFingerprint } from "../../supabase/functions/_shared/hired-personnel-authority.ts";
if (Deno.args.length !== 2)
  throw new Error("two_private_fixture_paths_required");
const personnel = JSON.parse(await Deno.readTextFile(Deno.args[0]));
const obligation = JSON.parse(await Deno.readTextFile(Deno.args[1]));
for (const key of ["raw", "rawCorrection", "rawEmpty"])
  await verifyFrozenTimeSnapshot(personnel[key]);
validateProjectInvoiceDestination(obligation.invoice);
validateManualObligationBaselineCommand(obligation.baseline);
if (
  personnel.initial.organization_id !==
    "11111111-1111-4111-8111-111111111111" ||
  personnel.initial.worker_id !== "44444444-4444-4444-8444-444444444444" ||
  personnel.initial.lines[0]?.amount_minor !== 60000 ||
  personnel.corrected.lines[0]?.amount_minor !== 45000 ||
  personnel.rawEmpty.blocks.length !== 0
)
  throw new Error("actual_synthetic_fixture_contract_required");
// The supplied actual calculator output has review revision3 before withdrawal4.
// This separate journey skips review and publishes the same frozen withdrawal at3.
const empty = { ...personnel.empty, source_revision: 3 };
console.log(
  JSON.stringify({
    personnel: { ...personnel, empty },
    obligation,
    fingerprints: {
      initial: await hiredPublicationFingerprint("time", personnel.initial),
      corrected: await hiredPublicationFingerprint("time", {
        ...personnel.corrected,
        source_revision: 2,
      }),
    },
  }),
);
