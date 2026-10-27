import importlib.util
import json
import threading
import unittest
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

path = Path(__file__).resolve().parent.parent / 'server' / 'local_account_setup.py'
spec = importlib.util.spec_from_file_location('vivid_local_setup', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class SetupTest(unittest.TestCase):
    def test_only_same_origin_can_create_and_password_uses_ssh_stdin(self):
        server = module.HTTPServer(('127.0.0.1', 0), module.Handler)
        module.PORT = server.server_port
        module.ORIGIN = f'http://127.0.0.1:{server.server_port}'
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        captured = {}
        def run(command, **kwargs):
            captured['command'], captured['input'] = command, kwargs['input']
            return SimpleNamespace(returncode=0)
        data = urllib.parse.urlencode({'username': 'person', 'password': 'private-password', 'confirm': 'private-password'}).encode()
        try:
            bad = urllib.request.Request(module.ORIGIN + '/create', data=data, headers={'Origin': 'https://evil.example'})
            with self.assertRaises(urllib.error.HTTPError) as err: urllib.request.urlopen(bad)
            self.assertEqual(err.exception.code, 403)
            good = urllib.request.Request(module.ORIGIN + '/create', data=data, headers={'Origin': module.ORIGIN})
            with patch.object(module.subprocess, 'run', side_effect=run):
                with urllib.request.urlopen(good) as response: self.assertEqual(response.status, 200)
            self.assertNotIn('private-password', ' '.join(captured['command']))
            self.assertEqual(json.loads(captured['input'])['password'], 'private-password')
        finally:
            server.shutdown(); server.server_close(); thread.join(timeout=2)

if __name__ == '__main__': unittest.main()
