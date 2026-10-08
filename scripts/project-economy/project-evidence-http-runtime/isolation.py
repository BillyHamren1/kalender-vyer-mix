"""Validate the disposable Operations HTTP boundary before any Docker command."""
import os
import re
from pathlib import Path

DATABASE = "eventflow_project_evidence_http_runtime"
RUNTIME_RELATIVE = "scripts/project-economy/project-evidence-http-runtime"
FIXED = {
    "PROJECT_EVIDENCE_DATABASE_NAME": DATABASE,
    "PROJECT_EVIDENCE_POSTGREST_URL": "http://127.0.0.1:55610/",
    "PROJECT_EVIDENCE_CONTROL_URL": "http://127.0.0.1:55611/",
}
FORBIDDEN = (
    "COMPOSE_FILE", "COMPOSE_PROJECT_NAME", "COMPOSE_PROFILES",
    "COMPOSE_ENV_FILES", "COMPOSE_PATH_SEPARATOR", "DOCKER_HOST",
    "DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH",
    "PGHOST", "PGHOSTADDR", "PGPORT", "PGDATABASE", "PGUSER",
    "PGPASSWORD", "PGPASSFILE", "PGSERVICE", "PGSERVICEFILE", "PGOPTIONS",
    "SUPABASE_URL", "SUPABASE_DB_URL", "DATABASE_URL",
    "PROJECT_EVIDENCE_JWT_SECRET", "PROJECT_EVIDENCE_CONTROL_TOKEN",
)


def validate(env):
    if env.get("CI") != "true" or env.get("ISOLATED_PROJECT_EVIDENCE_HTTP") != "true":
        raise ValueError("Explicit isolated project evidence CI required")
    if env.get("GITHUB_REPOSITORY") != "BillyHamren1/kalender-vyer-mix":
        raise ValueError("Canonical Operations repository required")
    run = env.get("GITHUB_RUN_ID", "")
    if not isinstance(run, str) or not re.fullmatch(r"[0-9]{1,20}", run):
        raise ValueError("Canonical numeric CI run required")
    for key, value in env.items():
        if value and (key in FORBIDDEN or key.startswith(("COMPOSE_", "DOCKER_", "PG", "SUPABASE_"))):
            raise ValueError("Foreign connection or scope override denied")
        if value and key.startswith("PROJECT_EVIDENCE_"):
            if key not in FIXED or value != FIXED[key]:
                raise ValueError("Foreign fixture runtime override denied")
    return "project-evidence-http-" + run


def validate_paths(repository_root, runtime_directory):
    """Reject foreign/symlinked runtime artifacts; caller supplies its own root."""
    root = Path(repository_root)
    runtime = Path(runtime_directory)
    expected = root / RUNTIME_RELATIVE
    if not root.is_absolute() or not runtime.is_absolute() or runtime != expected:
        raise ValueError("Exact absolute runtime path required")
    for target in (runtime, runtime / "compose.yml", runtime / "control.ts"):
        if not target.exists() or target.resolve() != target:
            raise ValueError("Missing or redirected runtime artifact")
    if not runtime.is_dir() or not (runtime / "compose.yml").is_file() or not (runtime / "control.ts").is_file():
        raise ValueError("Unexpected runtime artifact type")
    return runtime


if __name__ == "__main__":
    print(validate(os.environ))
