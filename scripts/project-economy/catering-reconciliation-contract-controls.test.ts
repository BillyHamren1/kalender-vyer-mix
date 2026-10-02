/** Fixed interoperability controls only. Admission descriptors are future native-test
 * requirements: this file does not simulate authorization or receiver acceptance. */
import controls from "./__fixtures__/catering-reconciliation-contract-controls.json" with {
  type: "json",
};
import captured from "../../supabase/functions/_shared/__fixtures__/cateringAllocationDelivery.json" with {
  type: "json",
};
import { createIsolatedCateringAllocationFixture } from "./catering-allocation-fixture.ts";
import {
  buildCateringReassignment,
  fingerprintCateringAllocationCost,
} from "../../supabase/functions/_shared/catering-project-reassignment.ts";
function assert(value: boolean, label: string): asserts value {
  if (!value) throw new Error(label);
}
async function sha(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const result = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(
    new Uint8Array(result),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
// Local fixture encoder only; never import it into production endpoints/adapters.
async function encodeControl(domain: string, input: Record<string, unknown>) {
  const object = Object.fromEntries(
    Object.keys(input).sort().map((key) => [key, input[key]]),
  );
  const bytes = new TextEncoder().encode(
    domain + "\n" + JSON.stringify(object),
  );
  return { hash: await sha(bytes), length: bytes.length };
}
for (const control of controls.scalar_controls) {
  Deno.test(
    "Python/Deno fixed serialization control: " + control.label,
    async () => {
      const actual = await encodeControl(control.domain, control.input);
      assert(
        actual.hash === control.expected_sha256,
        "scalar control hash mismatch",
      );
      assert(
        actual.length === control.expected_utf8_bytes,
        "scalar UTF-8 mismatch",
      );
      const reordered = Object.fromEntries(
        Object.entries(control.input).reverse(),
      );
      assert(
        (await encodeControl(control.domain, reordered)).hash === actual.hash,
        "scalar field ordering changed hash",
      );
    },
  );
}
Deno.test("history fixed vectors bind order and complete step sequence", async () => {
  const history = controls.history_control;
  const initial = await encodeControl(history.seed.domain, history.seed.input);
  assert(
    initial.hash === history.seed.expected_sha256,
    "history seed mismatch",
  );
  assert(
    initial.length === history.seed.expected_utf8_bytes,
    "history seed bytes mismatch",
  );
  let previous = initial.hash;
  for (const [position, link] of history.links.entries()) {
    assert(link.input.index === position + 1, "control index discontinuity");
    assert(
      link.input.previous_link_sha256 === previous,
      "control predecessor mismatch",
    );
    const actual = await encodeControl(link.domain, link.input);
    assert(actual.hash === link.expected_sha256, "history link mismatch");
    assert(
      actual.length === link.expected_utf8_bytes,
      "history link bytes mismatch",
    );
    previous = actual.hash;
  }
  assert(previous === history.expected_root_sha256, "history root mismatch");
  let changed = initial.hash;
  for (const [position, link] of [...history.links].reverse().entries()) {
    changed = (await encodeControl(link.domain, {
      ...link.input,
      index: position + 1,
      previous_link_sha256: changed,
    })).hash;
  }
  assert(changed !== previous, "reordering did not change history commitment");
  assert(
    history.links[0].expected_sha256 !== previous,
    "omission did not change history root",
  );
});
Deno.test("captured SQL fixture retains original immutable protocol bytes", async () => {
  assert(
    await sha(new TextEncoder().encode(captured.raw_body)) ===
      captured.body_sha256,
    "original body hash changed",
  );
  const body = JSON.parse(captured.raw_body);
  assert(Object.keys(body).length === 19, "delivery shape changed");
  assert(Object.keys(body.snapshot).length === 25, "native shape changed");
  assert(
    Object.keys(body.allocation_event).length === 26,
    "event shape changed",
  );
  assert(
    body.schema_version === "operations-catering-delivery.v2",
    "schema changed",
  );
});
Deno.test("existing complete/null controls preserve native hashes", async () => {
  const expected = [
    [
      "af72a07da37d4f803c946d1b42608ca0f2ef0e02b3324fb60757e06b1fe60f7a",
      "e3dcc99463e8fe8749f62c321ef0ed2654f221b140c50e3aa2eb0ac16cc9d7fd",
    ],
    [
      "7c7921f11f4cefb8ebe201fbdcfdff25c4472ebaaf583044865e3b9dbb1f48c9",
      "c6f46c5b19515faa4dbeb9bb153f1953cad7324a65a5fde4ce19e1a409ac404f",
    ],
  ];
  for (const [index, missing] of [false, true].entries()) {
    const f = await createIsolatedCateringAllocationFixture(missing);
    const actual = await buildCateringReassignment(
      f.command,
      f.saved,
      f.resolved,
    );
    assert(
      actual.event.fingerprint === expected[index][0],
      "event fingerprint changed",
    );
    assert(
      await fingerprintCateringAllocationCost(actual.snapshot) ===
        expected[index][1],
      "native cost hash changed",
    );
  }
});
