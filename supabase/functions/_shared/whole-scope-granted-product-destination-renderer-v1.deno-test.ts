/** Synthetic saved SQL lineage, PGlite supplementary origin; shape only, never authority. */
import {
  renderWholeScopeGrantedProductDestination as render,
  GRANTED_SCOPE_RENDERER_RESULT_SCHEMA,
} from "./whole-scope-granted-product-destination-renderer-v1.ts";
import { wholeScopeProductCanonicalJson as canonical } from "./whole-scope-product-source-proof.ts";
const fixtureRaw =
  '{"schema_version":"operations-whole-scope-granted-product-renderer-input.v1","publication":{"capture":{"as_of":"2026-10-02T23:39:34.353+00:00","members":[{"project_id":"55555555-5555-4555-8555-555555555555","obligation_id":"abababab-abab-4aba-8aba-abababababab","kernel_evidence":{"as_of":"2026-10-02T23:39:34.35+00:00","state":"captured","sources":[{"reason":null,"status":"preliminary","resolved":true,"invoice_id":"23232323-2323-4232-8232-232323232323","amount_minor":270000,"policy_state":"current","source_anchor":"a3681104b6f25b157e889339917f1b0a7d87bcb810e1e7fbb65304e996226530","policy_event_id":"66d812ca-6dcb-437f-9c11-4dfafc351eca","policy_revision":1,"binding_event_id":"acaeb56b-47ea-4d65-9ed4-f1c1d71ba67d","source_raw_sha256":"9898700579cbf6da9b35be95f55e230e7ce43563596f8e944c956e1ac59848cf","current_raw_sha256":"9898700579cbf6da9b35be95f55e230e7ce43563596f8e944c956e1ac59848cf","policy_fingerprint":"9bf8c59bd37b780d4a8c94b6f2fd5610ec7bf9427c9f9af81aa4561dacd61d8a","source_snapshot_id":"facf1e01-4d80-4da9-8878-e6ebac82370d","current_snapshot_id":"facf1e01-4d80-4da9-8878-e6ebac82370d","source_organization_id":"99999999-9999-4999-8999-999999999999","replaces_estimate_minor":300000,"source_economic_revision":1,"consumes_commitment_minor":null,"source_economic_fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},{"reason":null,"status":"preliminary","resolved":true,"invoice_id":"13131313-1313-4313-8313-131313131313","amount_minor":1000,"policy_state":"missing","source_anchor":"e8fbab4b4b71c5d69a62708c767d27c127b3d9717793a55247c7426e87e5783d","policy_event_id":null,"policy_revision":null,"binding_event_id":"13935c05-2fde-46b3-9fa6-cff9e459f05b","source_raw_sha256":"b57d08830c6a6eced73a18dc6e36f87d335c17874e417cda2ca6e05e2f217fcd","current_raw_sha256":"b57d08830c6a6eced73a18dc6e36f87d335c17874e417cda2ca6e05e2f217fcd","policy_fingerprint":null,"source_snapshot_id":"118c5795-272f-449a-8db6-c4f236b8932b","current_snapshot_id":"118c5795-272f-449a-8db6-c4f236b8932b","source_organization_id":"99999999-9999-4999-8999-999999999999","replaces_estimate_minor":null,"source_economic_revision":1,"consumes_commitment_minor":null,"source_economic_fingerprint":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"}],"baseline":{"category":"supplier","currency":"SEK","event_id":"553ce31e-59a7-49f3-8228-2d6328728665","revision":1,"cost_basis":"invoice","fingerprint":"f553e15803ef13e81633ad091e6080c92583070a7165b1d3cb0bc704fee2b085","estimate_minor":1000000,"evidence_basis":"operations_manual","committed_minor":null},"eac_minor":null,"project_id":"55555555-5555-4555-8555-555555555555","diagnostics":["category_coverage_unavailable","source_inventory_incomplete","credit_mapping_unavailable","time_and_native_catering_mapping_unavailable"],"shadow_only":true,"obligation_id":"abababab-abab-4aba-8aba-abababababab","schema_version":"operations-invoice-obligation-kernel-evidence.v1","authority_scope":"local_project_only","credit_eligible":false,"organization_id":"11111111-1111-4111-8111-111111111111","remaining_minor":null,"source_coverage":"unavailable","category_coverage":"unavailable","source_currentness":"saved_receiver_heads_only"},"captured_baseline_event_id":"553ce31e-59a7-49f3-8228-2d6328728665","captured_baseline_revision":1,"captured_baseline_fingerprint":"f553e15803ef13e81633ad091e6080c92583070a7165b1d3cb0bc704fee2b085"},{"project_id":"77777777-7777-4777-8777-777777777777","obligation_id":"cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd","kernel_evidence":{"as_of":"2026-10-02T23:39:34.351+00:00","state":"captured","sources":[{"reason":null,"status":"preliminary","resolved":true,"invoice_id":"23232323-2323-4232-8232-232323232323","amount_minor":270000,"policy_state":"current","source_anchor":"aea66d19b47c31f372475a3e6deabcea5b566818a7143f91dbcb357b0ead0e6a","policy_event_id":"7c82a84e-62c4-420a-96dc-eb70f4d19083","policy_revision":1,"binding_event_id":"cdbc2950-e5aa-4fe6-b0c1-6c70f04ea166","source_raw_sha256":"9898700579cbf6da9b35be95f55e230e7ce43563596f8e944c956e1ac59848cf","current_raw_sha256":"9898700579cbf6da9b35be95f55e230e7ce43563596f8e944c956e1ac59848cf","policy_fingerprint":"321feef217b04b74f1d88d448c77133d96d5de89ddeeb924697b80e665474c1e","source_snapshot_id":"facf1e01-4d80-4da9-8878-e6ebac82370d","current_snapshot_id":"facf1e01-4d80-4da9-8878-e6ebac82370d","source_organization_id":"99999999-9999-4999-8999-999999999999","replaces_estimate_minor":300000,"source_economic_revision":1,"consumes_commitment_minor":100000,"source_economic_fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}],"baseline":{"category":"supplier","currency":"SEK","event_id":"78cd1dbe-63c2-4b42-a0b4-7979246b307d","revision":1,"cost_basis":"invoice","fingerprint":"7942778489a3c19faf41829b89784b337fcb86e619fd80c56cf4e4c693402150","estimate_minor":500000,"evidence_basis":"operations_manual","committed_minor":200000},"eac_minor":null,"project_id":"77777777-7777-4777-8777-777777777777","diagnostics":["category_coverage_unavailable","source_inventory_incomplete","credit_mapping_unavailable","time_and_native_catering_mapping_unavailable"],"shadow_only":true,"obligation_id":"cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd","schema_version":"operations-invoice-obligation-kernel-evidence.v1","authority_scope":"local_project_only","credit_eligible":false,"organization_id":"11111111-1111-4111-8111-111111111111","remaining_minor":null,"source_coverage":"unavailable","category_coverage":"unavailable","source_currentness":"saved_receiver_heads_only"},"captured_baseline_event_id":"78cd1dbe-63c2-4b42-a0b4-7979246b307d","captured_baseline_revision":1,"captured_baseline_fingerprint":"7942778489a3c19faf41829b89784b337fcb86e619fd80c56cf4e4c693402150"},{"project_id":"55555555-5555-4555-8555-555555555555","obligation_id":"efefefef-efef-4efe-8efe-efefefefefef","kernel_evidence":{"as_of":"2026-10-02T23:39:34.352+00:00","state":"unsupported_basis","sources":[],"baseline":{"category":"personnel","currency":"SEK","event_id":"9bee6baa-f3af-49ef-947c-cd78c6124ccb","revision":1,"cost_basis":"time","fingerprint":"18ff7e46a750b7b987e93698a0245120dd0a9c24bdb2b825fa2eb266364466ac","estimate_minor":1000000,"evidence_basis":"operations_manual","committed_minor":null},"eac_minor":null,"project_id":"55555555-5555-4555-8555-555555555555","diagnostics":["category_coverage_unavailable","source_inventory_incomplete","credit_mapping_unavailable","time_and_native_catering_mapping_unavailable","unsupported_cost_basis"],"shadow_only":true,"obligation_id":"efefefef-efef-4efe-8efe-efefefefefef","schema_version":"operations-invoice-obligation-kernel-evidence.v1","authority_scope":"local_project_only","credit_eligible":false,"organization_id":"11111111-1111-4111-8111-111111111111","remaining_minor":null,"source_coverage":"unavailable","category_coverage":"unavailable","source_currentness":"saved_receiver_heads_only"},"captured_baseline_event_id":"9bee6baa-f3af-49ef-947c-cd78c6124ccb","captured_baseline_revision":1,"captured_baseline_fingerprint":"18ff7e46a750b7b987e93698a0245120dd0a9c24bdb2b825fa2eb266364466ac"}],"root_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","currency":"SEK","eac_minor":null,"root_kind":"large_project","diagnostics":["category_coverage_unavailable","source_inventory_incomplete","credit_mapping_unavailable","time_and_native_catering_mapping_unavailable","captured_inventory_changed"],"shadow_only":true,"budget_minor":null,"schema_version":"operations-scope-invoice-kernel-evidence.v1","scope_revision":1,"credit_eligible":false,"organization_id":"11111111-1111-4111-8111-111111111111","remaining_minor":null,"source_coverage":"unavailable","source_inventory":[{"reason":null,"invoice_id":"23232323-2323-4232-8232-232323232323","project_id":"55555555-5555-4555-8555-555555555555","policy_state":"current","mapping_state":"charging","obligation_id":"abababab-abab-4aba-8aba-abababababab","source_anchor":"a3681104b6f25b157e889339917f1b0a7d87bcb810e1e7fbb65304e996226530","policy_event_id":"66d812ca-6dcb-437f-9c11-4dfafc351eca","policy_revision":1,"binding_event_id":"acaeb56b-47ea-4d65-9ed4-f1c1d71ba67d","source_raw_sha256":"9898700579cbf6da9b35be95f55e230e7ce43563596f8e944c956e1ac59848cf","current_raw_sha256":"9898700579cbf6da9b35be95f55e230e7ce43563596f8e944c956e1ac59848cf","policy_fingerprint":"9bf8c59bd37b780d4a8c94b6f2fd5610ec7bf9427c9f9af81aa4561dacd61d8a","source_snapshot_id":"facf1e01-4d80-4da9-8878-e6ebac82370d","current_snapshot_id":"facf1e01-4d80-4da9-8878-e6ebac82370d","source_organization_id":"99999999-9999-4999-8999-999999999999","source_economic_revision":1,"source_economic_fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},{"reason":null,"invoice_id":"23232323-2323-4232-8232-232323232323","project_id":"77777777-7777-4777-8777-777777777777","policy_state":"current","mapping_state":"charging","obligation_id":"cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd","source_anchor":"aea66d19b47c31f372475a3e6deabcea5b566818a7143f91dbcb357b0ead0e6a","policy_event_id":"7c82a84e-62c4-420a-96dc-eb70f4d19083","policy_revision":1,"binding_event_id":"cdbc2950-e5aa-4fe6-b0c1-6c70f04ea166","source_raw_sha256":"9898700579cbf6da9b35be95f55e230e7ce43563596f8e944c956e1ac59848cf","current_raw_sha256":"9898700579cbf6da9b35be95f55e230e7ce43563596f8e944c956e1ac59848cf","policy_fingerprint":"321feef217b04b74f1d88d448c77133d96d5de89ddeeb924697b80e665474c1e","source_snapshot_id":"facf1e01-4d80-4da9-8878-e6ebac82370d","current_snapshot_id":"facf1e01-4d80-4da9-8878-e6ebac82370d","source_organization_id":"99999999-9999-4999-8999-999999999999","source_economic_revision":1,"source_economic_fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},{"reason":null,"invoice_id":"13131313-1313-4313-8313-131313131313","project_id":"55555555-5555-4555-8555-555555555555","policy_state":"missing","mapping_state":"charging","obligation_id":"abababab-abab-4aba-8aba-abababababab","source_anchor":"e8fbab4b4b71c5d69a62708c767d27c127b3d9717793a55247c7426e87e5783d","policy_event_id":null,"policy_revision":null,"binding_event_id":"13935c05-2fde-46b3-9fa6-cff9e459f05b","source_raw_sha256":"b57d08830c6a6eced73a18dc6e36f87d335c17874e417cda2ca6e05e2f217fcd","current_raw_sha256":"b57d08830c6a6eced73a18dc6e36f87d335c17874e417cda2ca6e05e2f217fcd","policy_fingerprint":null,"source_snapshot_id":"118c5795-272f-449a-8db6-c4f236b8932b","current_snapshot_id":"118c5795-272f-449a-8db6-c4f236b8932b","source_organization_id":"99999999-9999-4999-8999-999999999999","source_economic_revision":1,"source_economic_fingerprint":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"}],"category_coverage":{"other":"unavailable","catering":"unavailable","supplier":"unavailable","personnel":"unavailable"},"economic_scope_id":"90909090-9090-4909-8909-909090909090","scope_snapshot_id":"05e24b83-712f-4613-80b7-98689a9c6f59","source_currentness":"saved_receiver_heads_only","composition_revision":1,"membership_currentness":"as_of_graph","membership_fingerprint":"df0729634e6575364328787c8215da0d6b103f6dca1155ac378e4a8401c57ae6","composition_fingerprint":"e8aa47c72f5dbcff6acc55ff81316352bec8faded87493dbd849ab7b7fe72769","composition_snapshot_id":"390c0be0-6015-4e6b-882f-f7a38e50f5f5","saved_source_references":[{"project_id":"55555555-5555-4555-8555-555555555555","policy_state":"current","binding_state":"bound_original","obligation_id":"abababab-abab-4aba-8aba-abababababab","source_anchor":"a3681104b6f25b157e889339917f1b0a7d87bcb810e1e7fbb65304e996226530","policy_event_id":"66d812ca-6dcb-437f-9c11-4dfafc351eca","policy_revision":1,"binding_event_id":"acaeb56b-47ea-4d65-9ed4-f1c1d71ba67d","source_raw_sha256":"9898700579cbf6da9b35be95f55e230e7ce43563596f8e944c956e1ac59848cf","policy_fingerprint":"9bf8c59bd37b780d4a8c94b6f2fd5610ec7bf9427c9f9af81aa4561dacd61d8a","source_snapshot_id":"facf1e01-4d80-4da9-8878-e6ebac82370d","source_economic_revision":1,"source_economic_fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},{"project_id":"77777777-7777-4777-8777-777777777777","policy_state":"current","binding_state":"bound_original","obligation_id":"cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd","source_anchor":"aea66d19b47c31f372475a3e6deabcea5b566818a7143f91dbcb357b0ead0e6a","policy_event_id":"7c82a84e-62c4-420a-96dc-eb70f4d19083","policy_revision":1,"binding_event_id":"cdbc2950-e5aa-4fe6-b0c1-6c70f04ea166","source_raw_sha256":"9898700579cbf6da9b35be95f55e230e7ce43563596f8e944c956e1ac59848cf","policy_fingerprint":"321feef217b04b74f1d88d448c77133d96d5de89ddeeb924697b80e665474c1e","source_snapshot_id":"facf1e01-4d80-4da9-8878-e6ebac82370d","source_economic_revision":1,"source_economic_fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}],"captured_inventory_fingerprint":"db535444adc3a31e932dea27b9fa6df565a778aa4fc33bc8e83ccd5067213309","captured_inventory_matches_current":false},"command":{"reason":"Actual isolated current server captured snapshot","schema_version":"operations-whole-scope-granted-product-publication-command.v2","idempotency_key":"successor-native-initial","economic_scope_id":"90909090-9090-4909-8909-909090909090","expected_grant_revision":1,"expected_scope_revision":1,"expected_composition_revision":1,"expected_publication_revision":1,"expected_membership_fingerprint":"df0729634e6575364328787c8215da0d6b103f6dca1155ac378e4a8401c57ae6","expected_composition_fingerprint":"e8aa47c72f5dbcff6acc55ff81316352bec8faded87493dbd849ab7b7fe72769"},"actor_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","projection":{"as_of":"2026-10-02T23:39:34.353+00:00","root_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","currency":"SEK","eac_minor":null,"root_kind":"large_project","diagnostics":["category_coverage_unavailable","source_inventory_incomplete","credit_mapping_unavailable","time_and_native_catering_mapping_unavailable","captured_inventory_changed","category_coverage_unavailable","source_inventory_incomplete","credit_mapping_unavailable","time_and_native_catering_mapping_unavailable","unavailable_source_policy:e8fbab4b4b71c5d69a62708c767d27c127b3d9717793a55247c7426e87e5783d","category_coverage_unavailable","source_inventory_incomplete","credit_mapping_unavailable","time_and_native_catering_mapping_unavailable","category_coverage_unavailable","source_inventory_incomplete","credit_mapping_unavailable","time_and_native_catering_mapping_unavailable","unsupported_cost_basis"],"shadow_only":true,"budget_minor":null,"margin_minor":null,"member_count":3,"schema_version":"operations-scope-invoice-kernel-projection.v1","scope_revision":1,"authority_scope":"canonical_scope_invoice_capture","credit_eligible":false,"organization_id":"11111111-1111-4111-8111-111111111111","remaining_minor":null,"source_coverage":"unavailable","category_coverage":{"other":"unavailable","catering":"unavailable","supplier":"unavailable","personnel":"unavailable"},"economic_scope_id":"90909090-9090-4909-8909-909090909090","scope_snapshot_id":"05e24b83-712f-4613-80b7-98689a9c6f59","source_currentness":"saved_receiver_heads_only","composition_revision":1,"resolved_source_count":3,"membership_currentness":"as_of_graph","membership_fingerprint":"df0729634e6575364328787c8215da0d6b103f6dca1155ac378e4a8401c57ae6","composition_fingerprint":"e8aa47c72f5dbcff6acc55ff81316352bec8faded87493dbd849ab7b7fe72769","composition_snapshot_id":"390c0be0-6015-4e6b-882f-f7a38e50f5f5","excluded_source_anchors":[],"captured_inventory_fingerprint":"db535444adc3a31e932dea27b9fa6df565a778aa4fc33bc8e83ccd5067213309","known_captured_invoice_cost_minor":541000,"captured_inventory_matches_current":false,"confirmed_captured_invoice_cost_minor":0,"preliminary_captured_invoice_cost_minor":541000},"observed_at":"2026-10-02T23:39:34.353+00:00","shadow_only":true,"export_grant":{"event_id":"2ae9c866-7939-49ce-a81f-93e658bfe062","revision":1,"fingerprint":"0efd10099d5dc47b6fd53c142be682b687e6d48636d3be46f902ef87c85a3fb2","destination_scope_id":"17171717-1717-4717-8717-171717171717","destination_mapping_id":"abcdefab-cdef-4abc-8def-abcdefabcdef","destination_organization_id":"99999999-9999-4999-8999-999999999999","destination_mapping_revision":1},"publication_id":"9281e85a-83c4-4bba-bb23-f9105956ab2d","schema_version":"operations-whole-scope-granted-product-publication.v2","scope_revision":1,"full_membership":{"root_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","root_kind":"large_project","relationships":[{"relation":"project_booking","parent_id":"55555555-5555-4555-8555-555555555555","relation_id":"55555555-5555-4555-8555-555555555555","local_booking_id":"Legacy-Order-42"},{"relation":"large_project_booking","parent_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","relation_id":"ffffffff-ffff-4fff-8fff-ffffffffffff","local_booking_id":"Legacy-Order-42"},{"relation":"project_booking","parent_id":"77777777-7777-4777-8777-777777777777","relation_id":"77777777-7777-4777-8777-777777777777","local_booking_id":"Separate-Order-99"},{"relation":"large_project_booking","parent_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","relation_id":"14141414-1414-4414-8414-141414141414","local_booking_id":"Separate-Order-99"}],"root_evidence":{"status":null,"packing_parent_id":null,"primary_local_booking_id":"Legacy-Order-42"},"schema_version":"operations-project-scope-membership-v1","organization_id":"11111111-1111-4111-8111-111111111111","economic_mapping":"unavailable","integration_state":"membership_only","local_booking_ids":["Legacy-Order-42","Separate-Order-99"],"source_project_ids":["55555555-5555-4555-8555-555555555555","77777777-7777-4777-8777-777777777777"]},"organization_id":"11111111-1111-4111-8111-111111111111","source_manifest":[{"reason":null,"project_id":"55555555-5555-4555-8555-555555555555","policy_state":"current","mapping_state":"charging","obligation_id":"abababab-abab-4aba-8aba-abababababab","source_anchor":"a3681104b6f25b157e889339917f1b0a7d87bcb810e1e7fbb65304e996226530","policy_event_id":"66d812ca-6dcb-437f-9c11-4dfafc351eca","policy_revision":1,"binding_event_id":"acaeb56b-47ea-4d65-9ed4-f1c1d71ba67d","source_raw_sha256":"9898700579cbf6da9b35be95f55e230e7ce43563596f8e944c956e1ac59848cf","current_raw_sha256":"9898700579cbf6da9b35be95f55e230e7ce43563596f8e944c956e1ac59848cf","policy_fingerprint":"9bf8c59bd37b780d4a8c94b6f2fd5610ec7bf9427c9f9af81aa4561dacd61d8a","source_snapshot_id":"facf1e01-4d80-4da9-8878-e6ebac82370d","current_snapshot_id":"facf1e01-4d80-4da9-8878-e6ebac82370d","source_economic_revision":1,"source_economic_fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},{"reason":null,"project_id":"77777777-7777-4777-8777-777777777777","policy_state":"current","mapping_state":"charging","obligation_id":"cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd","source_anchor":"aea66d19b47c31f372475a3e6deabcea5b566818a7143f91dbcb357b0ead0e6a","policy_event_id":"7c82a84e-62c4-420a-96dc-eb70f4d19083","policy_revision":1,"binding_event_id":"cdbc2950-e5aa-4fe6-b0c1-6c70f04ea166","source_raw_sha256":"9898700579cbf6da9b35be95f55e230e7ce43563596f8e944c956e1ac59848cf","current_raw_sha256":"9898700579cbf6da9b35be95f55e230e7ce43563596f8e944c956e1ac59848cf","policy_fingerprint":"321feef217b04b74f1d88d448c77133d96d5de89ddeeb924697b80e665474c1e","source_snapshot_id":"facf1e01-4d80-4da9-8878-e6ebac82370d","current_snapshot_id":"facf1e01-4d80-4da9-8878-e6ebac82370d","source_economic_revision":1,"source_economic_fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},{"reason":null,"project_id":"55555555-5555-4555-8555-555555555555","policy_state":"missing","mapping_state":"charging","obligation_id":"abababab-abab-4aba-8aba-abababababab","source_anchor":"e8fbab4b4b71c5d69a62708c767d27c127b3d9717793a55247c7426e87e5783d","policy_event_id":null,"policy_revision":null,"binding_event_id":"13935c05-2fde-46b3-9fa6-cff9e459f05b","source_raw_sha256":"b57d08830c6a6eced73a18dc6e36f87d335c17874e417cda2ca6e05e2f217fcd","current_raw_sha256":"b57d08830c6a6eced73a18dc6e36f87d335c17874e417cda2ca6e05e2f217fcd","policy_fingerprint":null,"source_snapshot_id":"118c5795-272f-449a-8db6-c4f236b8932b","current_snapshot_id":"118c5795-272f-449a-8db6-c4f236b8932b","source_economic_revision":1,"source_economic_fingerprint":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"}],"economic_scope_id":"90909090-9090-4909-8909-909090909090","scope_snapshot_id":"05e24b83-712f-4613-80b7-98689a9c6f59","calculation_version":"operations-whole-scope-invoice-capture-sql.v1","composition_revision":1,"publication_revision":2,"membership_fingerprint":"df0729634e6575364328787c8215da0d6b103f6dca1155ac378e4a8401c57ae6","composition_fingerprint":"e8aa47c72f5dbcff6acc55ff81316352bec8faded87493dbd849ab7b7fe72769","composition_snapshot_id":"390c0be0-6015-4e6b-882f-f7a38e50f5f5","source_evidence_fingerprint":"546f0dd5e3bf9258d9bf9f557db683bb4c07ddce889ca4841074e15296450971"},"binding":{"grant_event_id":"2ae9c866-7939-49ce-a81f-93e658bfe062","publication_id":"9281e85a-83c4-4bba-bb23-f9105956ab2d","organization_id":"11111111-1111-4111-8111-111111111111","economic_scope_id":"90909090-9090-4909-8909-909090909090"},"grant_event":{"command":{"reason":"Actual independently authenticated saved issuer","enabled":true,"schema_version":"operations-whole-scope-product-export-grant-command.v1","idempotency_key":"successor-native-initial-real-grant","partner_version":"16161616-1616-4616-8616-161616161616","economic_scope_id":"90909090-9090-4909-8909-909090909090","destination_scope_id":"17171717-1717-4717-8717-171717171717","destination_mapping_id":"abcdefab-cdef-4abc-8def-abcdefabcdef","expected_grant_revision":0,"expected_scope_revision":1,"destination_organization_id":"99999999-9999-4999-8999-999999999999","destination_mapping_revision":1,"expected_composition_revision":1,"destination_mapping_fingerprint":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff","expected_membership_fingerprint":"df0729634e6575364328787c8215da0d6b103f6dca1155ac378e4a8401c57ae6","expected_composition_fingerprint":"e8aa47c72f5dbcff6acc55ff81316352bec8faded87493dbd849ab7b7fe72769"},"enabled":true,"actor_id":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","event_id":"2ae9c866-7939-49ce-a81f-93e658bfe062","revision":1,"created_at":"2026-10-02T23:39:34.264000Z","schema_version":"operations-whole-scope-product-export-grant-event.v1","scope_revision":1,"full_membership":{"root_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","root_kind":"large_project","relationships":[{"relation":"project_booking","parent_id":"55555555-5555-4555-8555-555555555555","relation_id":"55555555-5555-4555-8555-555555555555","local_booking_id":"Legacy-Order-42"},{"relation":"large_project_booking","parent_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","relation_id":"ffffffff-ffff-4fff-8fff-ffffffffffff","local_booking_id":"Legacy-Order-42"},{"relation":"project_booking","parent_id":"77777777-7777-4777-8777-777777777777","relation_id":"77777777-7777-4777-8777-777777777777","local_booking_id":"Separate-Order-99"},{"relation":"large_project_booking","parent_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","relation_id":"14141414-1414-4414-8414-141414141414","local_booking_id":"Separate-Order-99"}],"root_evidence":{"status":null,"packing_parent_id":null,"primary_local_booking_id":"Legacy-Order-42"},"schema_version":"operations-project-scope-membership-v1","organization_id":"11111111-1111-4111-8111-111111111111","economic_mapping":"unavailable","integration_state":"membership_only","local_booking_ids":["Legacy-Order-42","Separate-Order-99"],"source_project_ids":["55555555-5555-4555-8555-555555555555","77777777-7777-4777-8777-777777777777"]},"organization_id":"11111111-1111-4111-8111-111111111111","partner_version":"16161616-1616-4616-8616-161616161616","economic_scope_id":"90909090-9090-4909-8909-909090909090","scope_snapshot_id":"05e24b83-712f-4613-80b7-98689a9c6f59","command_fingerprint":"635ac623321d2e132ac4fd8f781a03045741237c3c6725bd443b16677e4e5c73","composition_revision":1,"destination_scope_id":"17171717-1717-4717-8717-171717171717","destination_mapping_id":"abcdefab-cdef-4abc-8def-abcdefabcdef","membership_fingerprint":"df0729634e6575364328787c8215da0d6b103f6dca1155ac378e4a8401c57ae6","composition_fingerprint":"e8aa47c72f5dbcff6acc55ff81316352bec8faded87493dbd849ab7b7fe72769","composition_snapshot_id":"390c0be0-6015-4e6b-882f-f7a38e50f5f5","destination_organization_id":"99999999-9999-4999-8999-999999999999","destination_mapping_revision":1,"destination_mapping_fingerprint":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"},"receipt":{"outcome":"accepted","shadow_only":true,"delivery_state":"blocked_missing_protected_source_export","grant_event_id":"2ae9c866-7939-49ce-a81f-93e658bfe062","grant_revision":1,"publication_id":"9281e85a-83c4-4bba-bb23-f9105956ab2d","schema_version":"operations-whole-scope-granted-product-publication-receipt.v2","historical_only":false,"grant_fingerprint":"0efd10099d5dc47b6fd53c142be682b687e6d48636d3be46f902ef87c85a3fb2","publication_revision":2,"source_evidence_fingerprint":"546f0dd5e3bf9258d9bf9f557db683bb4c07ddce889ca4841074e15296450971","source_publication_fingerprint":"dae3a5001192c2192f0ea4ba34654079d4254ac2eb62a3b0bf9cfe0fc03abbbf"}}';
type Row = Record<string, any>;
const fixture = (): Row => JSON.parse(fixtureRaw);
function assert(value: unknown): asserts value {
  if (value !== true) throw new Error("renderer_test_assertion_failed");
}
async function denied(value: unknown): Promise<void> {
  try {
    await render(value as string);
  } catch (e) {
    assert(
      e instanceof Error &&
        e.message === "invalid_whole_scope_granted_product_renderer_input",
    );
    return;
  }
  throw new Error("renderer_test_expected_denial");
}
async function fingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(JSON.stringify(value)));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (x) => x.toString(16).padStart(2, "0")).join("");
}
async function rebind(x: Row): Promise<void> {
  x.receipt.source_publication_fingerprint = await fingerprint([
    "operations-whole-scope-granted-product-publication-v2",
    x.publication,
  ]);
}
Deno.test(
  "exact saved lineage copies immutable partial values and contains no authority",
  async () => {
    const result = await render(fixtureRaw),
      x = fixture(),
      body = JSON.parse(result.destination_raw_body);
    assert(
      result.schema_version === GRANTED_SCOPE_RENDERER_RESULT_SCHEMA &&
        Object.isFrozen(result),
    );
    assert(
      Object.keys(result).sort().join(",") ===
        "destination_body_sha256,destination_raw_body,schema_version,source_publication_fingerprint",
    );
    assert(
      Object.keys(body).length === 23 && body.delivery_kind === "snapshot",
    );
    assert(
      canonical(JSON.stringify(body.projection)) ===
        canonical(JSON.stringify(x.publication.projection)) &&
        canonical(JSON.stringify(body.source_manifest)) ===
          canonical(JSON.stringify(x.publication.source_manifest)),
    );
    assert(
      body.projection.eac_minor === null &&
        body.projection.budget_minor === null &&
        body.projection.margin_minor === null &&
        body.projection.remaining_minor === null &&
        body.projection.credit_eligible === false,
    );
    assert(
      !("authorized" in result) &&
        !("current" in result) &&
        !("actor_id" in body) &&
        !("command" in body) &&
        !("capture" in body),
    );
    const digest = new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(result.destination_raw_body),
      ),
    );
    assert(
      Array.from(digest, (x) => x.toString(16).padStart(2, "0")).join("") ===
        result.destination_body_sha256,
    );
  },
);
Deno.test(
  "publication binding event and command selector mismatches denied",
  async () => {
    const mutations = [
      (x: Row) =>
        (x.binding.publication_id = "ffffffff-ffff-4fff-8fff-ffffffffffff"),
      (x: Row) =>
        (x.binding.organization_id = "ffffffff-ffff-4fff-8fff-ffffffffffff"),
      (x: Row) =>
        (x.binding.grant_event_id = "ffffffff-ffff-4fff-8fff-ffffffffffff"),
      (x: Row) => x.publication.command.expected_publication_revision--,
      (x: Row) => x.publication.command.expected_grant_revision++,
      (x: Row) => (x.publication.membership_fingerprint = "f".repeat(64)),
      (x: Row) => x.publication.composition_revision++,
      (x: Row) =>
        (x.grant_event.destination_mapping_id =
          "ffffffff-ffff-4fff-8fff-ffffffffffff"),
      (x: Row) => x.grant_event.destination_mapping_revision++,
    ];
    for (const mutate of mutations) {
      const x = fixture();
      mutate(x);
      await denied(JSON.stringify(x));
    }
  },
);
Deno.test(
  "saved accepted receipt required; replay or NULL history never becomes export",
  async () => {
    for (const mutate of [
      (x: Row) => (x.receipt.outcome = "replayed"),
      (x: Row) => (x.receipt.historical_only = true),
      (x: Row) => (x.receipt.grant_fingerprint = "f".repeat(64)),
      (x: Row) => (x.receipt.private_field = "private"),
      (x: Row) => delete x.receipt.shadow_only,
      (x: Row) => (x.publication.export_grant = null),
      (x: Row) =>
        (x.publication.schema_version =
          "operations-whole-scope-product-publication.v1"),
    ]) {
      const x = fixture();
      mutate(x);
      await denied(JSON.stringify(x));
    }
  },
);
Deno.test(
  "changed saved observation evidence and inventory rejected without truncation",
  async () => {
    for (const mutate of [
      (x: Row) => (x.publication.capture.as_of = "2026-10-01T00:00:00Z"),
      (x: Row) => (x.publication.source_evidence_fingerprint = "f".repeat(64)),
      (x: Row) => x.publication.source_manifest.reverse(),
      (x: Row) =>
        (x.publication.source_manifest[0].source_organization_id =
          "ffffffff-ffff-4fff-8fff-ffffffffffff"),
      (x: Row) => x.publication.projection.known_captured_invoice_cost_minor++,
    ]) {
      const x = fixture();
      mutate(x);
      await denied(JSON.stringify(x));
    }
  },
);
Deno.test(
  "unknown coverage EAC category and machine diagnostics denied with internally rebound encoding",
  async () => {
    for (const mutate of [
      (x: Row) => (x.publication.projection.eac_minor = 1),
      (x: Row) => (x.publication.projection.source_coverage = "complete"),
      (x: Row) =>
        (x.publication.projection.category_coverage.personnel = "complete"),
      (x: Row) =>
        x.publication.projection.diagnostics.push("private_unknown_diagnostic"),
      (x: Row) => (x.publication.projection.resolved_source_count = 0),
      (x: Row) =>
        (x.publication.projection.root_id =
          "ffffffff-ffff-4fff-8fff-ffffffffffff"),
      (x: Row) => (x.publication.projection.currency = "EUR"),
    ]) {
      const x = fixture();
      mutate(x);
      await rebind(x);
      await denied(JSON.stringify(x));
    }
  },
);
Deno.test(
  "pure encoding does not perform financial sums or confer authorization",
  async () => {
    const x = fixture();
    x.publication.projection.known_captured_invoice_cost_minor = 123;
    x.publication.projection.confirmed_captured_invoice_cost_minor = 456;
    x.publication.projection.preliminary_captured_invoice_cost_minor = 789;
    await rebind(x);
    const result = await render(JSON.stringify(x)),
      p = JSON.parse(result.destination_raw_body).projection;
    assert(
      p.known_captured_invoice_cost_minor === 123 &&
        p.confirmed_captured_invoice_cost_minor === 456 &&
        p.preliminary_captured_invoice_cost_minor === 789 &&
        !("authorized" in result),
    );
  },
);
Deno.test(
  "duplicate unsafe numeric and malformed Unicode raw inputs denied",
  async () => {
    await denied(
      fixtureRaw.replace(
        '"schema_version":',
        '"schema_version":"duplicate","schema_version":',
      ),
    );
    for (const token of [
      "9007199254740991.1",
      "9007199254740992",
      "1e-400",
      "-0",
    ])
      await denied(
        fixtureRaw.replace(
          '"publication_revision":2',
          '"publication_revision":' + token,
        ),
      );
    await denied('{"schema_version":"\\ud800"}');
    await denied(
      '{"schema_version":' + "[".repeat(34) + "0" + "]".repeat(34) + "}",
    );
  },
);
Deno.test(
  "object Proxy and giant primitive rejected without private reflection",
  async () => {
    let touches = 0;
    const proxy = new Proxy(
      {},
      {
        get() {
          touches++;
          throw Error("PRIVATE_SENTINEL");
        },
        getPrototypeOf() {
          touches++;
          throw Error("PRIVATE_SENTINEL");
        },
        ownKeys() {
          touches++;
          throw Error("PRIVATE_SENTINEL");
        },
      },
    );
    await denied(proxy);
    assert(touches === 0);
    await denied(" ".repeat(4194305));
  },
);
Deno.test("strict destination body cap retains no partial output", async () => {
  const x = fixture();
  x.publication.projection.diagnostics = Array(10000).fill(
    "category_coverage_unavailable",
  );
  await rebind(x);
  await denied(JSON.stringify(x));
});

Deno.test(
  "oversized raw rejected before string scans encoders or parser work",
  async () => {
    const oversized = " ".repeat(4194305);
    let touches = 0;
    const descriptors = [
      [
        String.prototype,
        "includes",
        Object.getOwnPropertyDescriptor(String.prototype, "includes")!,
      ],
      [
        String.prototype,
        "charCodeAt",
        Object.getOwnPropertyDescriptor(String.prototype, "charCodeAt")!,
      ],
      [
        TextEncoder.prototype,
        "encode",
        Object.getOwnPropertyDescriptor(TextEncoder.prototype, "encode")!,
      ],
    ] as const;
    let pending: ReturnType<typeof render>;
    try {
      for (const [object, key, descriptor] of descriptors)
        Object.defineProperty(object, key, {
          ...descriptor,
          value: () => {
            touches++;
            throw new Error("PRIVATE_SENTINEL");
          },
        });
      pending = render(oversized);
    } finally {
      for (const [object, key, descriptor] of descriptors)
        Object.defineProperty(object, key, descriptor);
    }
    try {
      await pending!;
    } catch (error) {
      assert(
        error instanceof Error &&
          error.message ===
            "invalid_whole_scope_granted_product_renderer_input" &&
          touches === 0,
      );
      return;
    }
    throw new Error("renderer_test_expected_denial");
  },
);
