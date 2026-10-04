import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('owned_proof', Path(__file__).with_name('proof.py'))
proof = importlib.util.module_from_spec(spec)
spec.loader.exec_module(proof)

def valid():
    return [{'case': name, 'result': 'PASS'} for name in proof.CASES] + [{'result': 'PASS', 'cases': 15, 'scope': proof.SCOPE}]

class Evidence(unittest.TestCase):
    def test_complete(self):
        self.assertEqual(len(proof.validate('\n'.join(map(json.dumps, valid())))), 16)
    def test_hostile_last_or_extra_row_never_prints_partial_proof(self):
        controls = []
        for field in ('secret', 'rawEntry', 'personId', 'jwt', 'rate'):
            rows = valid(); rows[-1][field] = 'PRIVATE_MARKER'; controls.append(rows)
        rows=valid();rows[-1]['cases']=14;controls.append(rows)
        rows=valid();rows[-2]=rows[0];controls.append(rows)
        controls += [valid()[:-1], valid()+[{'secret':'PRIVATE_MARKER'}], list(reversed(valid()))]
        for rows in controls:
            with tempfile.NamedTemporaryFile(mode='w') as f:
                f.write('\n'.join(map(json.dumps,rows)));f.flush()
                r=subprocess.run([sys.executable,str(Path(__file__).with_name('proof.py')),f.name],capture_output=True,text=True)
                self.assertNotEqual(r.returncode,0);self.assertEqual(r.stdout,'');self.assertNotIn('PRIVATE_MARKER',r.stderr)
    def test_changed_case_rejected(self):
        rows=valid();rows[0]['result']='FAIL'
        with self.assertRaises(ValueError):proof.validate('\n'.join(map(json.dumps,rows)))

if __name__ == '__main__':unittest.main()
