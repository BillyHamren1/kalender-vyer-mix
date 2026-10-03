#!/usr/bin/env python3
from __future__ import annotations

import json
import ast
import os
from pathlib import Path
import re
import runpy
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[2]
CLOSURE_BASE = "43ecab140ed7ffacc0ae36a0446ccfa9c890f7a2"
CLOSURE_TREE = "382c32e9f1a7d4f7189798676e512c439f94874e"
PUBLISHED_PARENT = "d3a74beda4c6ed615f3ee3f8ecf0a274f0563355"
PUBLISHED_PARENT_TREE = "8a0d4446490e32be6065636a8995fddc152f3ac7"
FILES = [
    ".github/workflows/operations-obligation-reconciliation-native.yml",
    "docs/project-economy/operations-obligation-reconciliation-v1-contract.md",
    "scripts/project-economy/operations-obligation-reconciliation-native-closure.json",
    "scripts/project-economy/operations-obligation-reconciliation-native-setup.sql",
    "scripts/project-economy/operations-obligation-reconciliation-native.guard-test.py",
    "scripts/project-economy/operations-obligation-reconciliation-native.py",
    "scripts/project-economy/operations-obligation-reconciliation-postgres-test.sql",
    "supabase/migrations/20261003210000_operations_obligation_reconciliation_v1.sql",
]
SUCCESSOR_FILES = [
    ".github/workflows/operations-obligation-reconciliation-native.yml",
    "scripts/project-economy/operations-obligation-reconciliation-native.guard-test.py",
    "supabase/migrations/20261003210000_operations_obligation_reconciliation_v1.sql",
]
MIGRATION = ROOT / FILES[-1]
TEST = ROOT / "scripts/project-economy/operations-obligation-reconciliation-postgres-test.sql"
RUNNER = ROOT / "scripts/project-economy/operations-obligation-reconciliation-native.py"
SETUP = ROOT / "scripts/project-economy/operations-obligation-reconciliation-native-setup.sql"
WORKFLOW = ROOT / FILES[0]
CONTRACT = ROOT / FILES[1]
CLOSURE = ROOT / FILES[2]
IMAGE = "docker.io/library/postgres@sha256:e27d24a29acce1b554771ba68c43afa55446069d228310451bb8c96c1531d2cb"


def validate_provenance(
    *, mode: str, head: str, head_tree: str, parent: str | None, parent_tree: str,
    revision_count: int, changed_paths: list[str], status_codes: list[str],
) -> None:
    """Bind either the uncommitted candidate or its unknown-hash published successor."""
    if mode not in ("local", "published"):
        raise AssertionError("invalid_provenance_mode")
    if parent_tree != PUBLISHED_PARENT_TREE:
        raise AssertionError("wrong_parent_tree")
    if sorted(changed_paths) != SUCCESSOR_FILES:
        raise AssertionError("wrong_successor_paths")
    if mode == "local":
        if head != PUBLISHED_PARENT or head_tree != PUBLISHED_PARENT_TREE or parent is not None or revision_count != 0:
            raise AssertionError("wrong_local_parent")
        if len(status_codes) != len(SUCCESSOR_FILES) or any(code not in (" M", "M ") for code in status_codes):
            raise AssertionError("invalid_local_status")
    else:
        if parent != PUBLISHED_PARENT or head == PUBLISHED_PARENT or head_tree == PUBLISHED_PARENT_TREE or revision_count != 1:
            raise AssertionError("wrong_published_parent")
        if status_codes:
            raise AssertionError("published_checkout_not_clean")


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


class Guard(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.sql = MIGRATION.read_text()
        cls.test = TEST.read_text()
        cls.runner = RUNNER.read_text()
        cls.setup = SETUP.read_text()
        cls.workflow = WORKFLOW.read_text()
        cls.contract = CONTRACT.read_text()
        cls.closure = json.loads(CLOSURE.read_text())

    def test_exact_source_route_for_local_or_published_successor(self) -> None:
        mode = os.environ.get("OPS_RECONCILIATION_PROVENANCE_MODE", "local")
        status = subprocess.check_output(
            ["git", "status", "--porcelain", "--untracked-files=all"], cwd=ROOT, text=True
        ).splitlines()
        status_codes = [line[:2] for line in status]
        status_paths = sorted(line[3:] for line in status)
        if mode == "local":
            self.assertNotIn("OPS_RECONCILIATION_EXPECTED_PARENT", os.environ)
            self.assertNotIn("OPS_RECONCILIATION_EXPECTED_PARENT_TREE", os.environ)
            changed = sorted(set(git("diff", "--name-only", "HEAD").splitlines()) | set(git("diff", "--cached", "--name-only", "HEAD").splitlines()))
            self.assertEqual(changed, status_paths)
            validate_provenance(mode=mode, head=git("rev-parse", "HEAD"), head_tree=git("rev-parse", "HEAD^{tree}"),
                                parent=None, parent_tree=git("rev-parse", "HEAD^{tree}"), revision_count=0,
                                changed_paths=changed, status_codes=status_codes)
        else:
            self.assertEqual(os.environ.get("OPS_RECONCILIATION_EXPECTED_PARENT"), PUBLISHED_PARENT)
            self.assertEqual(os.environ.get("OPS_RECONCILIATION_EXPECTED_PARENT_TREE"), PUBLISHED_PARENT_TREE)
            parent = git("rev-parse", "HEAD^")
            validate_provenance(mode=mode, head=git("rev-parse", "HEAD"), head_tree=git("rev-parse", "HEAD^{tree}"),
                                parent=parent, parent_tree=git("rev-parse", f"{parent}^{{tree}}"),
                                revision_count=int(git("rev-list", "--count", f"{parent}..HEAD")),
                                changed_paths=git("diff", "--name-only", parent, "HEAD").splitlines(), status_codes=status_codes)
        self.assertEqual(self.closure["base_commit"], CLOSURE_BASE)
        self.assertEqual(self.closure["base_tree"], CLOSURE_TREE)

    def test_provenance_models_and_negative_parent_tree_path_guards(self) -> None:
        local = dict(mode="local", head=PUBLISHED_PARENT, head_tree=PUBLISHED_PARENT_TREE, parent=None,
                     parent_tree=PUBLISHED_PARENT_TREE, revision_count=0, changed_paths=SUCCESSOR_FILES,
                     status_codes=[" M", " M", " M"])
        published = dict(mode="published", head="f" * 40, head_tree="e" * 40, parent=PUBLISHED_PARENT,
                         parent_tree=PUBLISHED_PARENT_TREE, revision_count=1, changed_paths=SUCCESSOR_FILES,
                         status_codes=[])
        validate_provenance(**local)
        validate_provenance(**published)
        for invalid in (
            published | {"parent": "0" * 40},
            published | {"parent_tree": "1" * 40},
            published | {"changed_paths": SUCCESSOR_FILES + ["unexpected.sql"]},
            local | {"head": "2" * 40},
            local | {"status_codes": ["??", " M"]},
        ):
            with self.assertRaises(AssertionError):
                validate_provenance(**invalid)

    def test_default_off_and_operations_owned(self) -> None:
        self.assertIn("enabled boolean not null default false", self.sql)
        self.assertIn("operations_obligation_reconciliation_snapshots", self.sql)
        self.assertIn("operations_obligation_reconciliation_heads", self.sql)
        self.assertIn("operations_obligation_reconciliation_receipts", self.sql)
        self.assertIn("Operations owns the reconciliation", self.contract)
        self.assertFalse(self.closure["default_enabled"])
        self.assertEqual(self.closure["authority_owner"], "operations")

    def test_no_finance_or_source_authority_writes(self) -> None:
        lowered = self.sql.lower()
        for verb in ("insert into", "update", "delete from"):
            for target in (
                "public.finance_", "public.operations_finance_invoice_", "public.operations_project_obligation_",
                "public.operations_obligation_source_", "public.operations_obligation_credit_", "public.operations_hired_",
            ):
                self.assertNotRegex(lowered, rf"{verb}\s+{re.escape(target)}(?!reconciliation)")
        self.assertIn("'finance_recalculated',false", self.sql)
        self.assertIn("'finance_copy_eligible',complete and overcredit=0", self.sql)
        self.assertNotIn("fortnox", lowered)

    def test_command_cannot_supply_money(self) -> None:
        command_keys = re.search(
            r"not\(p \?& array\['schema_version','project_id','obligation_id'.*?'reason'\]\)", self.sql, re.S
        )
        self.assertIsNotNone(command_keys)
        for forbidden in ("amount_minor", "estimate_minor", "committed_minor", "rate_minor", "eac_minor"):
            self.assertNotIn(forbidden, command_keys.group(0))

    def test_saved_authorities_are_read_and_count_cas_bound(self) -> None:
        for text in (
            "public.operations_finance_invoice_economic_current_v2",
            "public.operations_obligation_source_policy_heads",
            "operations_economy_private.read_credit_capacity_v1",
            "operations_hired_private.read_source_v1",
            "expected_invoice_source_count",
            "expected_credit_source_count",
            "expected_hired_source_count",
            "authority_inventory_changed",
        ):
            self.assertIn(text, self.sql)

    def test_missing_is_null_and_hired_never_charges(self) -> None:
        for text in (
            "'current_amount_minor',case when complete then current_amount else null end",
            "'visible_unallocated_minor',case when complete then unallocated else null end",
            "'missing_cost_is_null',true",
            "'charged_minor',0",
            "missing_hired_rate:",
        ):
            self.assertIn(text, self.sql)
        self.assertNotRegex(self.sql, r"coalesce\([^\n]*(amount_minor|estimate_minor|committed_minor)[^\n]*,\s*0\)")

    def test_supersession_close_and_frozen_semantics(self) -> None:
        for text in (
            "duplicate_obligation_reconciliation_supersession",
            "unknown_obligation_reconciliation_supersession_anchor",
            "unresolved_obligation_reconciliation_supersession",
            "'active',not superseded",
            "'close_action','close'",
            "frozen_close_snapshot_id",
            "post_close_credit_updates_current_not_frozen",
            "reopen_retains_frozen_close",
            "reclose_preserves_first_frozen_close",
        ):
            self.assertTrue(text in self.sql or text in self.test, text)

    def test_canonical_lock_precedes_authority_reads_without_second_key(self) -> None:
        start = self.sql.index("create function operations_economy_private.append_obligation_reconciliation_v1")
        end = self.sql.index("revoke all on function operations_economy_private.append_obligation_reconciliation_v1", start)
        append = self.sql[start:end]
        lock = "pg_advisory_xact_lock(hashtextextended('obligation-org:'||org,0))"
        self.assertEqual(append.count(lock), 1)
        self.assertNotIn("obligation-reconciliation:", append)
        lock_at = append.index(lock)
        for authority_read in (
            "from public.operations_project_obligation_heads h join public.operations_project_obligation_baselines b",
            "from public.operations_project_obligation_invoice_bindings",
            "from public.operations_finance_invoice_economic_current_v2",
            "from public.operations_obligation_source_policy_heads",
            "from public.operations_obligation_credit_capacity_heads",
            "from public.operations_hired_assignment_heads",
        ):
            self.assertLess(lock_at, append.index(authority_read), authority_read)

    def test_locked_read_functions_are_volatile(self) -> None:
        private_start = self.sql.index("create function operations_economy_private.read_obligation_reconciliation_v1")
        private_end = self.sql.index(
            "revoke all on function operations_economy_private.read_obligation_reconciliation_v1", private_start
        )
        private_read = self.sql[private_start:private_end]
        self.assertIn("returns jsonb language plpgsql volatile security definer", private_read)
        self.assertNotIn(" language plpgsql stable ", private_read)
        self.assertEqual(private_read.count(" for share"), 2)
        self.assertLess(private_read.index("for share"), private_read.index("select document into strict current_doc"))

        public_start = self.sql.index("create function public.read_operations_obligation_reconciliation_v1")
        public_end = self.sql.index(
            "revoke all on function public.read_operations_obligation_reconciliation_v1", public_start
        )
        public_read = self.sql[public_start:public_end]
        self.assertIn("returns jsonb language sql volatile security invoker", public_read)
        self.assertNotIn(" language sql stable ", public_read)
        self.assertIn("operations_economy_private.read_obligation_reconciliation_v1", public_read)

    def test_read_envelope_exposes_immutable_first_frozen_close_head(self) -> None:
        private_start = self.sql.index("create function operations_economy_private.read_obligation_reconciliation_v1")
        private_end = self.sql.index(
            "revoke all on function operations_economy_private.read_obligation_reconciliation_v1", private_start
        )
        private_read = self.sql[private_start:private_end]
        head_lock = "select * into h from public.operations_obligation_reconciliation_heads"
        frozen_head = "'frozen_close_snapshot_id',h.frozen_close_snapshot_id"
        frozen_document = "'frozen_close',frozen_doc"
        self.assertEqual(private_read.count(frozen_head), 1)
        self.assertLess(private_read.index(head_lock), private_read.index(frozen_head))
        self.assertLess(private_read.index(frozen_head), private_read.index(frozen_document))
        self.assertIn("reply->>'frozen_close_snapshot_id'=first_frozen", self.test)
        self.assertIn("reply->>'snapshot_id'<>first_frozen", self.test)

    def test_security_invoker_schema_usage_matrix(self) -> None:
        self.assertIn("grant usage on schema operations_economy_private to authenticated,service_role;", self.setup)
        self.assertIn("security invoker", self.sql)

    def test_required_matrix_is_explicit(self) -> None:
        labels = (
            "preliminary_current_amount", "allocated_plus_unallocated_equals_document",
            "confirmation_same_identity_no_double_count", "reallocation_supersedes_without_deleting_history",
            "close_freezes_current_snapshot", "post_close_credit_updates_current_not_frozen",
            "overcredit_is_visible_and_not_copy_eligible", "reopen_retains_frozen_close",
            "missing_hired_rate_never_zero", "hired_complete_is_evidence_not_second_charge",
            "exact_retry_replays_receipt", "stale_cas_is_nonmutating", "failed_append_rolls_back_without_snapshot",
            "auth_failures_nonmutating", "duplicate hired identity accepted",
            "changed_body_and_actor_replays_fail_closed", "unknown_supersession_anchors_fail_closed_nonmutating",
            "reclose_preserves_first_frozen_close", "second_reopen_preserves_first_frozen_close",
            "security_invoker_schema_usage_matrix", "canonical_lock_precedes_all_authority_reads_without_second_key",
            "matrix_session_isolated_from_setup", "matrix_session_claims_and_role_bound",
        )
        for label in labels:
            self.assertIn(label, self.test)
        self.assertIn('outcomes != ["accepted", "stale"]', self.runner)

    def test_matrix_bootstraps_claims_in_its_own_session(self) -> None:
        isolated = self.test.index("matrix_session_isolated_from_setup")
        subject = self.test.index("set request.jwt.claim.sub='10101010-1010-4010-8010-101010101010';")
        organization = self.test.index("set request.jwt.claim.organization_id='11111111-1111-4111-8111-111111111111';")
        claim_role = self.test.index("set request.jwt.claim.role='admin';")
        db_role = self.test.index("set role authenticated;")
        bound = self.test.index("matrix_session_claims_and_role_bound")
        first_append = self.test.index("public.append_operations_obligation_reconciliation_v1")
        self.assertLess(isolated, subject)
        self.assertLess(subject, organization)
        self.assertLess(organization, claim_role)
        self.assertLess(claim_role, db_role)
        self.assertLess(db_role, bound)
        self.assertLess(bound, first_append)
        self.assertEqual(self.test.count("set request.jwt.claim.role='admin';"), 1)
        self.assertIn("set request.jwt.claim.organization_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';", self.test)
        self.assertIn("set request.jwt.claim.sub='';", self.test)

    def test_native_runtime_is_bounded_and_pinned(self) -> None:
        self.assertEqual(self.runner.count(IMAGE), 1)
        for text in (
            '"--network", "none"', '"--read-only"', '"--memory", "805306368"', '"--pids-limit", "256"',
            "EXPECTED_BINARY", "EXPECTED_PACKAGE", 'docker("container", "rm", "--force", cid', 'docker("inspect", cid',
            "OPS_RECONCILIATION_NATIVE_PASS", "OPS_RECONCILIATION_NATIVE_FAILURE",
            "return finalize_result(result, cleanup_failed, success_message)",
        ):
            self.assertIn(text, self.runner)
        namespace = runpy.run_path(str(RUNNER), run_name="obligation_reconciliation_runner_test")
        self.assertEqual(namespace["finalize_result"](0, True, "must-not-print"), 1)
        self.assertEqual(namespace["finalize_result"](1, False, ""), 1)

    def test_final_postmaster_readiness_and_redacted_diagnostics(self) -> None:
        namespace = runpy.run_path(str(RUNNER), run_name="obligation_reconciliation_readiness_test")
        advance = namespace["advance_readiness_streak"]
        sanitize = namespace["sanitize_diagnostic"]
        self.assertEqual(advance(False, True, 2), 0)
        self.assertEqual(advance(True, False, 2), 0)
        self.assertEqual(advance(True, True, 0), 1)
        self.assertEqual(advance(True, True, advance(True, True, advance(True, True, 0))), 3)
        for credential_payload in (
            "Authorization: Bearer first second third",
            "Authorization Basic dXNlcjpwYXNz extra",
            "token = alpha beta gamma",
            "password : multi word credential",
            "secret    = quoted value with spaces",
            '{"token":"json quoted multi word"}',
            '{\n  "password":\n  "value on a later line"\n}',
            "PGPASSWORD=plain text value",
            "POSTGRES_PASSWORD=json adjacent value",
            "ACCESS_TOKEN=header shaped value",
            "api_token = lowercase underscored value",
        ):
            self.assertEqual(sanitize(credential_payload), "<redacted sensitive diagnostic payload>")
        bounded = sanitize("\n".join(f"safe-{index}-" + "x" * 700 for index in range(100)))
        self.assertLessEqual(len(bounded), 4000)
        self.assertLessEqual(len(bounded.splitlines()), 80)
        self.assertNotIn("safe-0-", bounded)
        for text in (
            "INIT_COMPLETE_MARKER", "REQUIRED_READY_STREAK = 3", '"pg_isready", "-h", LOOPBACK',
            '"psql", "-XAt", "--no-password", "-h", LOOPBACK',
            '"psql", "-X", "--no-password", "-h", LOOPBACK',
            '"-e", "PGPASSWORD=synthetic-only", cid,\n            "psql"',
            '"exec", "-e", "PGPASSWORD=synthetic-only", cid, "psql"',
            'docker("logs", "--tail", "80"', "emit_container_diagnostics(cid)",
        ):
            self.assertIn(text, self.runner)
        self.assertNotIn('"psql", "-X", "--no-password", "-U"', self.runner)
        self.assertEqual(self.runner.count('PGPASSWORD=synthetic-only'), 2)

    def test_workflow_is_exact_and_read_only(self) -> None:
        for text in (
            "permissions:\n  contents: read", "ubuntu-24.04", "timeout-minutes: 15",
            "actions/checkout@11d5960a326750d5838078e36cf38b85af677262", IMAGE,
            "python3 -I -B scripts/project-economy/operations-obligation-reconciliation-native.guard-test.py",
            "python3 -I -B scripts/project-economy/operations-obligation-reconciliation-native.py",
        ):
            self.assertIn(text, self.workflow)
        self.assertNotIn("pull_request_target", self.workflow)
        self.assertNotIn("contents: write", self.workflow)
        self.assertIn(f"OPS_RECONCILIATION_EXPECTED_PARENT: {PUBLISHED_PARENT}", self.workflow)
        self.assertIn(f"OPS_RECONCILIATION_EXPECTED_PARENT_TREE: {PUBLISHED_PARENT_TREE}", self.workflow)
        self.assertIn("OPS_RECONCILIATION_PROVENANCE_MODE: published", self.workflow)
        self.assertNotIn("EXPECTED_HEAD", self.workflow)

    def test_no_nul_and_python_compiles(self) -> None:
        for relative in FILES:
            self.assertNotIn(b"\0", (ROOT / relative).read_bytes(), relative)
        ast.parse(RUNNER.read_text(), filename=str(RUNNER))
        ast.parse(Path(__file__).read_text(), filename=str(Path(__file__)))


if __name__ == "__main__":
    unittest.main()
