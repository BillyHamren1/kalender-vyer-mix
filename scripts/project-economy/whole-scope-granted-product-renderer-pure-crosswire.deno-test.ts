/** Frozen synthetic saved SQL→Finance encoding golden. No receiver/admission runtime. */
import golden from "./whole-scope-granted-product-renderer-pure-golden.json" with { type: "json" };
import { renderWholeScopeGrantedProductDestination as render } from "../../supabase/functions/_shared/whole-scope-granted-product-destination-renderer-v1.ts";
function check(value: unknown): asserts value {
  if (value !== true) throw new Error("renderer_pure_crosswire_failed");
}
Deno.test(
  "renderer exact bytes match genuine saved SQL preverified Finance encoding golden",
  async () => {
    check(
      golden.schema_version ===
        "operations-whole-scope-renderer-pure-golden.v1",
    );
    check(
      golden.finance_origin.repository === "BillyHamren1/eventflow-finance" &&
        golden.finance_origin.commit ===
          "2eca853a49ec69d23fd321f989c44ab09418921d" &&
        golden.finance_origin.git_blob ===
          "77a948268d8c007203298d8f69493b9138b8a630" &&
        golden.finance_origin.sha256 ===
          "6e9c71210e72b5b8ba33c173977e1a974115244467439ee81999509cd70a4fed",
    );
    const result = await render(golden.input_raw);
    check(
      result.destination_raw_body === golden.destination_raw_body &&
        result.destination_body_sha256 === golden.destination_body_sha256 &&
        result.source_publication_fingerprint ===
          golden.source_publication_fingerprint,
    );
    const body = JSON.parse(result.destination_raw_body);
    check(
      body.projection.eac_minor === null &&
        body.projection.budget_minor === null &&
        body.projection.margin_minor === null &&
        body.projection.remaining_minor === null,
    );
    check(
      !("authorized" in result) &&
        !("current" in result) &&
        !("signature" in result),
    );
  },
);
Deno.test(
  "saved SQL lineage substitution cannot preserve the Finance encoding golden",
  async () => {
    const input = JSON.parse(golden.input_raw);
    input.binding.grant_event_id = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    try {
      await render(JSON.stringify(input));
    } catch (error) {
      check(
        error instanceof Error &&
          error.message ===
            "invalid_whole_scope_granted_product_renderer_input",
      );
      return;
    }
    throw new Error("renderer_pure_crosswire_expected_denial");
  },
);
