import importlib.util
import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent

class Upstream(BaseHTTPRequestHandler):
    def log_message(self, *_args): pass
    def do_POST(self):
        data = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        self.send_response(502 if data['model'] == 'first:free' else 200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({'choices': [{'message': {'content': 'ready'}}]}).encode())

class GatewayTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='vivid-gateway-test-', dir=HERE)
        cls.directory = Path(cls.temp.name).resolve()
        assert cls.directory.parent == HERE
        cls.token = cls.directory / 'token'
        cls.token.write_text('test-token')
        os.environ['VIVID_TOKEN_FILE'] = str(cls.token)
        os.environ['VIVID_DB_FILE'] = str(cls.directory / 'accounts.sqlite3')
        os.environ['VIVID_MODELS'] = 'first:free,second:free'
        spec = importlib.util.spec_from_file_location('vivid_gateway', HERE.parent / 'server' / 'vivid_ai_gateway.py')
        sys.path.insert(0, str(HERE.parent / 'server'))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.ACCOUNTS.create_account('owner', 'long-password')
        cls.upstream = ThreadingHTTPServer(('127.0.0.1', 0), Upstream)
        module.UPSTREAM = f'http://127.0.0.1:{cls.upstream.server_port}'
        cls.gateway = ThreadingHTTPServer(('127.0.0.1', 0), module.Handler)
        for server in (cls.upstream, cls.gateway): threading.Thread(target=server.serve_forever, daemon=True).start()
        cls.base = f'http://127.0.0.1:{cls.gateway.server_port}'

    @classmethod
    def tearDownClass(cls):
        for server in (cls.gateway, cls.upstream): server.shutdown(); server.server_close()
        assert cls.directory.parent == HERE
        cls.temp.cleanup()

    def request(self, method, path, body=None, token=''):
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(self.base + path, data=data, method=method, headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(request, timeout=5) as response: return response.status, json.load(response)
        except urllib.error.HTTPError as error: return error.code, json.load(error)

    def test_bot_token_scope_and_revocation(self):
        status, login = self.request('POST', '/v1/login', {'username': 'owner', 'secret': 'long-password'})
        self.assertEqual(status, 200)
        owner = login['token']
        status, created = self.request('POST', '/v1/bot-tokens', {'name': 'Library Agent', 'scopes': ['library:read', 'sources:manage']}, owner)
        self.assertEqual(status, 201)
        bot = created['token']
        self.assertEqual(self.request('GET', '/v1/state', token=bot)[0], 200)
        self.assertEqual(self.request('GET', '/v1/bot-tokens', token=bot)[0], 403)
        self.assertEqual(self.request('POST', '/v1/infer', {'messages': [{'role': 'user', 'content': 'hello'}]}, bot)[0], 403)
        self.assertEqual(self.request('POST', '/v1/bot/actions', {'action': 'source.add', 'data': {'url': 'https://catalog.example/'}}, bot)[0], 200)
        self.assertEqual(self.request('POST', '/v1/bot/actions', {'action': 'playlist.create', 'data': {'name': 'Not allowed', 'mediaIds': []}}, bot)[0], 403)
        self.assertIn('https://catalog.example/', [source['url'] for source in self.request('GET', '/v1/bot/sources', token=bot)[1]['sources']])
        self.assertEqual(self.request('POST', '/v1/bot-tokens/revoke', {'id': created['id']}, owner)[0], 200)
        self.assertEqual(self.request('GET', '/v1/state', token=bot)[0], 403)

    def test_auth_fallback_and_conflict(self):
        self.assertEqual(self.request('GET', '/v1/state', token='bad')[0], 403)
        status, login = self.request('POST', '/v1/login', {'username': 'owner', 'secret': 'long-password'})
        self.assertEqual(status, 200)
        token = login['token']
        status, result = self.request('POST', '/v1/infer', {'messages': [{'role': 'user', 'content': 'hello'}]}, token)
        self.assertEqual((status, result['text'], result['model']), (200, 'ready', 'second:free'))
        state = {'media': [], 'playlists': [], 'channels': [], 'sources': [{'url': 'https://example.com/'}]}
        self.assertEqual(self.request('PUT', '/v1/state', {'revision': 0, 'state': state}, token), (200, {'revision': 1}))
        self.assertEqual(self.request('PUT', '/v1/state', {'revision': 0, 'state': state}, token)[0], 409)
        self.assertEqual(self.request('GET', '/v1/state', token=token)[1], {'revision': 1, 'state': state})
        status, profile = self.request('POST', '/v1/profiles', {'name': 'Kids', 'pin': '1234', 'role': 'child', 'policy': {'mode': 'approved_only'}}, token)
        self.assertEqual(status, 201)
        child = self.request('POST', '/v1/login', {'username': 'owner', 'profile': 'Kids', 'secret': '1234'})[1]['token']
        self.assertEqual(self.request('POST', '/v1/infer', {'messages': [{'role': 'user', 'content': 'hello'}]}, child)[0], 403)
        self.assertEqual(self.request('PUT', '/v1/state', {'revision': 1, 'state': state}, child)[0], 403)
        self.assertNotIn('sources', self.request('GET', '/v1/state', token=child)[1]['state'])
        policy = {'profileId': profile['id'], 'policy': {'mode': 'age_limit', 'maxAge': 12, 'approvedMediaIds': [], 'sharedPlaylistIds': []}}
        self.assertEqual(self.request('POST', '/v1/profiles/policy', policy, child)[0], 403)
        self.assertEqual(self.request('POST', '/v1/profiles/policy', policy, token)[0], 200)
        self.assertEqual(self.request('POST', '/v1/logout', {}, child)[0], 200)
        self.assertEqual(self.request('GET', '/v1/state', token=child)[0], 403)

if __name__ == '__main__': unittest.main()
