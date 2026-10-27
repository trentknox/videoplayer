#!/usr/bin/env python3
"""Authenticated, loopback-only Vivid gateway with a free-model fallback ladder."""
import json
import os
import threading
import time
import sqlite3
import urllib.error
import urllib.request
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from accounts import Accounts

TOKEN = Path(os.environ.get('VIVID_TOKEN_FILE', str(Path.home() / '.hermes/brain-proxy-vivid.token'))).read_text().strip()
UPSTREAM_TOKEN = Path(os.environ['VIVID_UPSTREAM_TOKEN_FILE']).read_text().strip() if os.environ.get('VIVID_UPSTREAM_TOKEN_FILE') else TOKEN
ORIGINS = {origin.strip() for origin in os.environ.get('VIVID_ALLOWED_ORIGINS', 'https://vivid-media-player.pages.dev').split(',') if origin.strip()}
MODELS = [m.strip() for m in os.environ.get('VIVID_MODELS', 'upstage/solar-mini4:free,poolside/laguna-s-2.1:free,meituan/longcat-2.5-preview:free').split(',') if m.strip()]
UPSTREAM = os.environ.get('VIVID_HERMES_URL', 'http://127.0.0.1:3019').rstrip('/')
ACCOUNTS = Accounts(os.environ.get('VIVID_DB_FILE', str(Path.home() / 'vivid-ai-gateway/accounts.sqlite3')))
LIMIT = 10
recent = deque()
lock = threading.Lock()
login_attempts = deque()

class Handler(BaseHTTPRequestHandler):
    def log_message(self, _format, *_args):
        pass

    def send_json(self, status, value):
        body = json.dumps(value).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        if self.headers.get('Origin') in ORIGINS:
            self.send_header('Access-Control-Allow-Origin', self.headers['Origin'])
            self.send_header('Vary', 'Origin')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        if self.headers.get('Origin') not in ORIGINS:
            return self.send_json(403, {'error': 'origin_not_allowed'})
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', self.headers['Origin'])
        self.send_header('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
        if self.headers.get('Access-Control-Request-Private-Network', '').lower() == 'true':
            self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Vary', 'Origin')
        self.end_headers()

    def authorized(self, bot_scope=None):
        candidate = self.headers.get('Authorization', '').removeprefix('Bearer ').strip()
        if not candidate.isascii(): return None
        return candidate if ACCOUNTS.session(candidate) or (bot_scope and ACCOUNTS.bot_session(candidate, bot_scope)) else None

    def read_json(self, limit=32768):
        size = int(self.headers.get('Content-Length', '0'))
        if size <= 0 or size > limit: raise ValueError('invalid size')
        data = json.loads(self.rfile.read(size))
        if not isinstance(data, dict): raise ValueError('invalid body')
        return data

    def do_GET(self):
        if self.path not in ('/v1/state', '/v1/profiles', '/v1/bot-tokens', '/v1/bot/sources'): return self.send_json(404, {'error': 'not_found'})
        token = self.authorized('library:read' if self.path == '/v1/state' else 'sources:manage' if self.path == '/v1/bot/sources' else None)
        if not token: return self.send_json(403, {'error': 'unauthorized'})
        try:
            if self.path == '/v1/profiles': return self.send_json(200, {'profiles': ACCOUNTS.list_profiles(token)})
            if self.path == '/v1/bot-tokens': return self.send_json(200, {'tokens': ACCOUNTS.list_bot_tokens(token)})
            if self.path == '/v1/bot/sources': return self.send_json(200, {'sources': ACCOUNTS.read_bot_sources(token)})
            revision, state = ACCOUNTS.read_bot_library(token) if ACCOUNTS.bot_session(token, 'library:read') else ACCOUNTS.read_library(token)
            return self.send_json(200, {'revision': revision, 'state': state})
        except PermissionError: return self.send_json(403, {'error': 'forbidden'})
        except (OSError, ValueError, sqlite3.Error): return self.send_json(500, {'error': 'state_unavailable'})

    def do_PUT(self):
        if self.path != '/v1/state': return self.send_json(404, {'error': 'not_found'})
        token = self.authorized()
        if not token: return self.send_json(403, {'error': 'unauthorized'})
        try:
            data = self.read_json(8 * 1024 * 1024)
            state = data.get('state')
            if not isinstance(data.get('revision'), int) or not isinstance(state, dict) or any(not isinstance(state.get(key), list) for key in ('media', 'playlists', 'channels')):
                return self.send_json(400, {'error': 'invalid_state'})
            return self.send_json(200, {'revision': ACCOUNTS.write_library(token, data['revision'], state)})
        except PermissionError: return self.send_json(403, {'error': 'forbidden'})
        except RuntimeError: return self.send_json(409, {'error': 'revision_conflict'})
        except (ValueError, TypeError, json.JSONDecodeError): return self.send_json(400, {'error': 'invalid_state'})
        except sqlite3.Error: return self.send_json(500, {'error': 'state_save_failed'})

    def do_POST(self):
        if self.path == '/v1/login':
            with lock:
                now = time.monotonic()
                while login_attempts and login_attempts[0] < now - 60: login_attempts.popleft()
                if len(login_attempts) >= 10: return self.send_json(429, {'error': 'rate_limited'})
                login_attempts.append(now)
            try:
                data = self.read_json(4096)
                username, secret, profile = data.get('username'), data.get('secret'), data.get('profile')
                if not isinstance(username, str) or not isinstance(secret, str) or len(username) > 100 or len(secret) > 1024 or (profile is not None and (not isinstance(profile, str) or len(profile) > 80)):
                    raise ValueError('invalid credentials')
                session_token = ACCOUNTS.login_profile(username, profile, secret) if profile else ACCOUNTS.login_owner(username, secret)
                if not session_token: return self.send_json(403, {'error': 'invalid_credentials'})
                session = ACCOUNTS.session(session_token)
                return self.send_json(200, {'token': session_token, 'role': session[2]})
            except (ValueError, TypeError, sqlite3.Error): return self.send_json(400, {'error': 'invalid_request'})
        if self.path == '/v1/bot/actions':
            candidate = self.headers.get('Authorization', '').removeprefix('Bearer ').strip()
            if not candidate.isascii() or not any(ACCOUNTS.bot_session(candidate, scope) for scope in ('sources:manage', 'playlists:manage', 'channels:manage')): return self.send_json(403, {'error': 'unauthorized'})
            try:
                data = self.read_json(64 * 1024)
                return self.send_json(200, ACCOUNTS.bot_action(candidate, data.get('action'), data.get('data')))
            except PermissionError: return self.send_json(403, {'error': 'forbidden'})
            except (ValueError, TypeError, sqlite3.Error): return self.send_json(400, {'error': 'invalid_request'})
        if self.path not in ('/v1/infer', '/v1/profiles', '/v1/profiles/policy', '/v1/playlists/lock', '/v1/playlists/unlock', '/v1/logout', '/v1/bot-tokens', '/v1/bot-tokens/revoke'): return self.send_json(404, {'error': 'not_found'})
        token = self.authorized('inference' if self.path == '/v1/infer' else None)
        if not token: return self.send_json(403, {'error': 'unauthorized'})
        if self.path == '/v1/logout':
            ACCOUNTS.logout(token)
            return self.send_json(200, {'ok': True})
        if self.path in ('/v1/bot-tokens', '/v1/bot-tokens/revoke'):
            try:
                data = self.read_json(4096)
                if self.path.endswith('/revoke'):
                    if not ACCOUNTS.revoke_bot_token(token, data.get('id')): return self.send_json(404, {'error': 'token_not_found'})
                    return self.send_json(200, {'ok': True})
                return self.send_json(201, ACCOUNTS.create_bot_token(token, data.get('name'), data.get('scopes'), data.get('days', 30)))
            except PermissionError: return self.send_json(403, {'error': 'forbidden'})
            except (ValueError, TypeError, sqlite3.Error): return self.send_json(400, {'error': 'invalid_request'})
        if self.path in ('/v1/playlists/lock', '/v1/playlists/unlock'):
            if self.path.endswith('/unlock'):
                with lock:
                    now = time.monotonic()
                    while login_attempts and login_attempts[0] < now - 60: login_attempts.popleft()
                    if len(login_attempts) >= 10: return self.send_json(429, {'error': 'rate_limited'})
                    login_attempts.append(now)
            try:
                data = self.read_json(4096)
                playlist_id, pin = data.get('playlistId'), data.get('pin')
                if not isinstance(playlist_id, str) or not isinstance(pin, str): raise ValueError('invalid request')
                if self.path.endswith('/lock'):
                    ACCOUNTS.lock_playlist(token, playlist_id, pin)
                elif not ACCOUNTS.unlock_playlist(token, playlist_id, pin):
                    return self.send_json(403, {'error': 'invalid_passcode'})
                return self.send_json(200, {'ok': True})
            except PermissionError: return self.send_json(403, {'error': 'forbidden'})
            except (ValueError, TypeError, sqlite3.Error): return self.send_json(400, {'error': 'invalid_request'})
        if self.path == '/v1/profiles/policy':
            try:
                data = self.read_json(8 * 1024 * 1024)
                if not isinstance(data.get('profileId'), str) or not isinstance(data.get('policy'), dict): raise ValueError('invalid policy')
                ACCOUNTS.update_child_policy(token, data['profileId'], data['policy'])
                return self.send_json(200, {'ok': True})
            except PermissionError: return self.send_json(403, {'error': 'forbidden'})
            except (ValueError, TypeError, sqlite3.Error): return self.send_json(400, {'error': 'invalid_policy'})
        if self.path == '/v1/profiles':
            try:
                data = self.read_json(8192)
                name, pin, role = data.get('name'), data.get('pin'), data.get('role')
                if not all(isinstance(value, str) for value in (name, pin, role)): raise ValueError('invalid profile')
                profile_id = ACCOUNTS.create_profile(token, name, pin, role, data.get('policy'))
                return self.send_json(201, {'id': profile_id})
            except PermissionError: return self.send_json(403, {'error': 'forbidden'})
            except (ValueError, TypeError, sqlite3.Error): return self.send_json(400, {'error': 'invalid_profile'})
        session = ACCOUNTS.session(token)
        if session and session[2] == 'child': return self.send_json(403, {'error': 'child_ai_unavailable'})
        if not session and not ACCOUNTS.bot_session(token, 'inference'): return self.send_json(403, {'error': 'unauthorized'})
        with lock:
            now = time.monotonic()
            while recent and recent[0] < now - 60:
                recent.popleft()
            if len(recent) >= LIMIT:
                return self.send_json(429, {'error': 'rate_limited'})
            recent.append(now)
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if size <= 0 or size > 32768:
                return self.send_json(400, {'error': 'invalid_request_size'})
            request = json.loads(self.rfile.read(size))
            if not isinstance(request, dict): return self.send_json(400, {'error': 'invalid_request'})
            messages = request.get('messages')
            if not isinstance(messages, list) or not 1 <= len(messages) <= 12:
                return self.send_json(400, {'error': 'invalid_messages'})
            if any(not isinstance(m, dict) or m.get('role') not in ('system', 'user', 'assistant') or not isinstance(m.get('content'), str) or len(m['content']) > 16000 for m in messages):
                return self.send_json(400, {'error': 'invalid_messages'})
            max_tokens = max(1, min(int(request.get('max_tokens', 512)), 512))
        except (ValueError, TypeError, json.JSONDecodeError):
            return self.send_json(400, {'error': 'invalid_request'})
        for model in MODELS:
            payload = json.dumps({'model': model, 'messages': messages, 'max_tokens': max_tokens}).encode()
            upstream = urllib.request.Request(UPSTREAM + '/v1/service/chat/completions', data=payload, headers={'Content-Type': 'application/json', 'x-service-token': UPSTREAM_TOKEN})
            try:
                with urllib.request.urlopen(upstream, timeout=25) as response:
                    data = json.load(response)
                content = data.get('choices', [{}])[0].get('message', {}).get('content')
                if isinstance(content, str) and content.strip():
                    return self.send_json(200, {'text': content, 'model': model})
            except (urllib.error.URLError, TimeoutError, ValueError, KeyError, IndexError, TypeError):
                continue
        return self.send_json(502, {'error': 'all_models_unavailable'})

if __name__ == '__main__':
    if not TOKEN:
        raise SystemExit('Vivid service token is missing')
    ThreadingHTTPServer((os.environ.get('VIVID_BIND', '127.0.0.1'), int(os.environ.get('VIVID_PORT', '3020'))), Handler).serve_forever()
