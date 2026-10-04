import tempfile
import unittest
from pathlib import Path
from isolation import FIXED, FORBIDDEN, RUNTIME_RELATIVE, validate, validate_paths


class Isolation(unittest.TestCase):
    def env(self):
        return dict(CI="true", ISOLATED_PROJECT_EVIDENCE_HTTP="true",
                    GITHUB_REPOSITORY="BillyHamren1/kalender-vyer-mix", GITHUB_RUN_ID="123")

    def test_named_run_and_fixed_runtime(self):
        self.assertEqual(validate(self.env()), "project-evidence-http-123")
        self.assertEqual(validate(dict(self.env(), **FIXED)), "project-evidence-http-123")

    def test_each_foreign_override(self):
        for key in (*FORBIDDEN, "COMPOSE_UNRECOGNIZED", "DOCKER_CONFIG", "PGSSLMODE", "SUPABASE_ACCESS_TOKEN", "PROJECT_EVIDENCE_OTHER"):
            with self.subTest(key=key), self.assertRaises(ValueError):
                validate(dict(self.env(), **{key: "foreign"}))

    def test_missing_or_wrong_authority(self):
        for key in self.env():
            for value in (None, "", "false", "foreign"):
                env = self.env()
                if value is None:
                    env.pop(key)
                else:
                    env[key] = value
                with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                    validate(env)

    def test_hostile_run_identifiers(self):
        for run in ("123;rm", "123/..", "-1", "123\n", "１２３", "1" * 21, "$(touch x)"):
            with self.subTest(run=run), self.assertRaises(ValueError):
                validate(dict(self.env(), GITHUB_RUN_ID=run))

    def test_exact_endpoint_and_database(self):
        for key in FIXED:
            for value in ("foreign", FIXED[key] + "?x=1", FIXED[key] + "#fragment"):
                with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                    validate(dict(self.env(), **{key: value}))
        for url in ("http://localhost:55610/", "http://127.0.0.1:55612/", "http://user@127.0.0.1:55610/", "https://127.0.0.1:55610/", "http://127.0.0.1:55610/rpc/"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                validate(dict(self.env(), PROJECT_EVIDENCE_POSTGREST_URL=url))

    def test_paths_and_symlink_denial(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            runtime = root / RUNTIME_RELATIVE
            runtime.mkdir(parents=True)
            for name in ("compose.yml", "control.ts"):
                (runtime / name).write_text("fixture", encoding="utf-8")
            self.assertEqual(validate_paths(root, runtime), runtime)
            with self.assertRaises(ValueError):
                validate_paths(root, runtime.parent)
            with self.assertRaises(ValueError):
                validate_paths(Path("."), runtime)
            (runtime / "compose.yml").unlink()
            with self.assertRaises(ValueError):
                validate_paths(root, runtime)
            outside = root / "foreign.yml"
            outside.write_text("fixture", encoding="utf-8")
            (runtime / "compose.yml").symlink_to(outside)
            with self.assertRaises(ValueError):
                validate_paths(root, runtime)


if __name__ == "__main__":
    unittest.main()
