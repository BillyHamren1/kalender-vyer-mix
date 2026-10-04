"""Hostile/private/partial logs cannot produce public acceptance."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

path = Path(__file__).with_name('drilldown-proof.py')
spec = importlib.util.spec_from_file_location('drilldown_proof', path)
proof = importlib.util.module_from_spec(spec)
spec.loader.exec_module(proof)

class PrivateEvidence(unittest.TestCase):
    def valid(self):
        return [{'case': case, 'result': 'PASS'} for case in proof.CASES] + [{'result': 'PASS', 'cases': 18, 'scope': proof.SCOPE}]

    def test_exact_complete(self):
        self.assertEqual(len(proof.validate('\n'.join(map(json.dumps, self.valid())))), 19)

    def test_failure_diagnostic_never_accepts_or_emits_private_fields(self):
        rows = [{'case': proof.CASES[0], 'result': 'FAIL', 'reason': 'authenticated drilldown proof failed'}]
        self.assertEqual(json.loads(proof.failure(json.dumps(rows[0])))['accepted'], False)
        for changed in [dict(rows[0], authorization='private-fixture'), dict(rows[0], case='private-fixture'), dict(rows[0], reason='private-fixture')]:
            with self.assertRaises(ValueError):
                proof.failure(json.dumps(changed))

    def test_hostile_logs_emit_nothing(self):
        rows = self.valid()
        mutations = [rows[:-1], rows + [{'private': 'hidden'}], list(reversed(rows)), [rows[0]] + rows[2:], rows[:3] + [rows[0]] + rows[4:]]
        for field in ('authorization', 'requestBody', 'accessToken'):
            changed = self.valid()
            changed[0][field] = 'private-fixture'
            mutations.append(changed)
        changed = self.valid()
        changed[-1]['cases'] = 17
        mutations.append(changed)
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / 'private.jsonl'
            for mutation in mutations:
                with self.subTest(mutation_length=len(mutation)):
                    file.write_text('\n'.join(map(json.dumps, mutation)))
                    result = subprocess.run([sys.executable, str(path), str(file)], text=True, capture_output=True, timeout=5)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertEqual(result.stdout, '')
                    self.assertNotIn('private-fixture', result.stderr)

if __name__ == '__main__':
    unittest.main()
