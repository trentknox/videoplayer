"""Vivid account and profile storage; HTTP authorization is handled separately."""
import hashlib
import hmac
import ipaddress
import json
from urllib.parse import urlsplit, urlunsplit
import secrets
import sqlite3
import time
from datetime import datetime, timezone
from contextlib import closing
from pathlib import Path

from profile_policy import child_library

def _derive(secret, salt):
    return hashlib.scrypt(secret.encode('utf-8'), salt=salt, n=16384, r=8, p=1, dklen=32)

class Accounts:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with closing(self.connect()) as db, db:
            db.executescript('''
              CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, salt BLOB NOT NULL, secret BLOB NOT NULL);
              CREATE TABLE IF NOT EXISTS profiles(id TEXT PRIMARY KEY, account_id TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, salt BLOB, secret BLOB, policy TEXT NOT NULL, FOREIGN KEY(account_id) REFERENCES accounts(id));
              CREATE UNIQUE INDEX IF NOT EXISTS profile_names ON profiles(account_id, name COLLATE NOCASE);
              CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, profile_id TEXT NOT NULL, expires INTEGER NOT NULL);
              CREATE TABLE IF NOT EXISTS libraries(account_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, state TEXT NOT NULL);
              CREATE TABLE IF NOT EXISTS playlist_locks(account_id TEXT NOT NULL, playlist_id TEXT NOT NULL, salt BLOB NOT NULL, secret BLOB NOT NULL, PRIMARY KEY(account_id,playlist_id));
              CREATE TABLE IF NOT EXISTS playlist_unlocks(token_hash TEXT NOT NULL, playlist_id TEXT NOT NULL, PRIMARY KEY(token_hash,playlist_id));
              CREATE TABLE IF NOT EXISTS bot_tokens(id TEXT PRIMARY KEY, account_id TEXT NOT NULL, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, scopes TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER, FOREIGN KEY(account_id) REFERENCES accounts(id));
            ''')
        self.path.chmod(0o600)

    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.execute('PRAGMA foreign_keys=ON')
        return db

    def create_account(self, username, password):
        username = username.strip().casefold()
        if not username or len(username) > 100 or len(password) < 8 or len(password) > 1024:
            raise ValueError('invalid account credentials')
        salt = secrets.token_bytes(16)
        account_id, profile_id = secrets.token_urlsafe(18), secrets.token_urlsafe(18)
        with closing(self.connect()) as db, db:
            db.execute('INSERT INTO accounts VALUES (?,?,?,?)', (account_id, username, salt, _derive(password, salt)))
            db.execute('INSERT INTO profiles VALUES (?,?,?,?,?,?,?)', (profile_id, account_id, 'Owner', 'owner', None, None, '{}'))
        return account_id

    def _issue(self, db, account_id, profile_id):
        token = secrets.token_urlsafe(32)
        digest = hashlib.sha256(token.encode()).hexdigest()
        db.execute('INSERT INTO sessions VALUES (?,?,?,?)', (digest, account_id, profile_id, int(time.time()) + 12 * 3600))
        return token

    def login_owner(self, username, password):
        with closing(self.connect()) as db, db:
            row = db.execute('SELECT id,salt,secret FROM accounts WHERE username=?', (username.strip().casefold(),)).fetchone()
            salt = row[1] if row else bytes(16)
            expected = row[2] if row else bytes(32)
            if not hmac.compare_digest(_derive(password, salt), expected) or not row: return None
            profile_id = db.execute("SELECT id FROM profiles WHERE account_id=? AND role='owner'", (row[0],)).fetchone()[0]
            return self._issue(db, row[0], profile_id)

    def session(self, token):
        if not isinstance(token, str) or len(token) > 256: return None
        digest = hashlib.sha256(token.encode()).hexdigest()
        with closing(self.connect()) as db, db:
            return db.execute('SELECT s.account_id,p.id,p.role,p.policy FROM sessions s JOIN profiles p ON p.id=s.profile_id AND p.account_id=s.account_id WHERE s.token_hash=? AND s.expires>?', (digest, int(time.time()))).fetchone()

    def create_profile(self, owner_token, name, pin, role, policy=None):
        owner = self.session(owner_token)
        if not owner or owner[2] != 'owner': raise PermissionError('owner required')
        name = name.strip()
        if not name or len(name) > 80 or role not in ('adult', 'child') or not pin.isascii() or not pin.isdigit() or not 4 <= len(pin) <= 12:
            raise ValueError('invalid profile')
        policy = policy or {'mode': 'approved_only'}
        if role == 'child': child_library({'media': [], 'playlists': []}, policy)
        profile_id, salt = secrets.token_urlsafe(18), secrets.token_bytes(16)
        with closing(self.connect()) as db, db:
            db.execute('INSERT INTO profiles VALUES (?,?,?,?,?,?,?)', (profile_id, owner[0], name, role, salt, _derive(pin, salt), json.dumps(policy)))
        return profile_id

    def login_profile(self, username, profile_name, pin):
        with closing(self.connect()) as db, db:
            row = db.execute("SELECT p.account_id,p.id,p.salt,p.secret FROM profiles p JOIN accounts a ON a.id=p.account_id WHERE a.username=? AND p.name=? COLLATE NOCASE AND p.role!='owner'", (username.strip().casefold(), profile_name.strip())).fetchone()
            salt, expected = (row[2], row[3]) if row else (bytes(16), bytes(32))
            if not hmac.compare_digest(_derive(pin, salt), expected) or not row: return None
            return self._issue(db, row[0], row[1])

    def list_profiles(self, token):
        owner = self.session(token)
        if not owner or owner[2] != 'owner': raise PermissionError('owner required')
        with closing(self.connect()) as db, db:
            return [{'id': row[0], 'name': row[1], 'role': row[2], 'policy': json.loads(row[3])} for row in db.execute('SELECT id,name,role,policy FROM profiles WHERE account_id=? ORDER BY name', (owner[0],))]

    def update_child_policy(self, token, profile_id, policy):
        owner = self.session(token)
        if not owner or owner[2] != 'owner': raise PermissionError('owner required')
        child_library({'media': [], 'playlists': []}, policy)
        with closing(self.connect()) as db, db:
            updated = db.execute("UPDATE profiles SET policy=? WHERE id=? AND account_id=? AND role='child'", (json.dumps(policy), profile_id, owner[0])).rowcount
            if not updated: raise ValueError('child profile not found')

    def logout(self, token):
        if not isinstance(token, str) or len(token) > 256: return
        digest = hashlib.sha256(token.encode()).hexdigest()
        with closing(self.connect()) as db, db:
            db.execute('DELETE FROM playlist_unlocks WHERE token_hash=?', (digest,))
            db.execute('DELETE FROM sessions WHERE token_hash=?', (digest,))

    def create_bot_token(self, owner_token, name, scopes, days=30):
        owner = self.session(owner_token)
        if not owner or owner[2] != 'owner': raise PermissionError('owner required')
        if not isinstance(name, str) or not name.strip() or len(name) > 80 or not isinstance(scopes, list) or not scopes or any(scope not in ('inference', 'library:read', 'sources:manage', 'playlists:manage', 'channels:manage') for scope in scopes) or type(days) is not int or not 1 <= days <= 365: raise ValueError('invalid bot token')
        token = 'vivid_bot_' + secrets.token_urlsafe(32)
        token_id = secrets.token_urlsafe(18)
        now = int(time.time())
        with closing(self.connect()) as db, db:
            db.execute('INSERT INTO bot_tokens VALUES (?,?,?,?,?,?,?,NULL)', (token_id, owner[0], name.strip(), hashlib.sha256(token.encode()).hexdigest(), json.dumps(sorted(set(scopes))), now, now + days * 86400))
        return {'id': token_id, 'token': token, 'expiresAt': now + days * 86400}

    def bot_session(self, token, required_scope):
        if not isinstance(token, str) or not token.startswith('vivid_bot_') or len(token) > 256: return None
        digest = hashlib.sha256(token.encode()).hexdigest()
        with closing(self.connect()) as db:
            row = db.execute('SELECT account_id,scopes FROM bot_tokens WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?', (digest, int(time.time()))).fetchone()
        if not row or required_scope not in json.loads(row[1]): return None
        return row[0]

    def list_bot_tokens(self, owner_token):
        owner = self.session(owner_token)
        if not owner or owner[2] != 'owner': raise PermissionError('owner required')
        with closing(self.connect()) as db:
            return [{'id': row[0], 'name': row[1], 'scopes': json.loads(row[2]), 'createdAt': row[3], 'expiresAt': row[4], 'revoked': row[5] is not None} for row in db.execute('SELECT id,name,scopes,created_at,expires_at,revoked_at FROM bot_tokens WHERE account_id=? ORDER BY created_at DESC', (owner[0],))]

    def revoke_bot_token(self, owner_token, token_id):
        owner = self.session(owner_token)
        if not owner or owner[2] != 'owner': raise PermissionError('owner required')
        if not isinstance(token_id, str) or len(token_id) > 100: raise ValueError('invalid token id')
        with closing(self.connect()) as db, db:
            return bool(db.execute('UPDATE bot_tokens SET revoked_at=? WHERE id=? AND account_id=? AND revoked_at IS NULL', (int(time.time()), token_id, owner[0])).rowcount)

    def read_bot_library(self, token):
        account_id = self.bot_session(token, 'library:read')
        if not account_id: raise PermissionError('bot library scope required')
        with closing(self.connect()) as db:
            row = db.execute('SELECT revision,state FROM libraries WHERE account_id=?', (account_id,)).fetchone()
            locks = {entry[0] for entry in db.execute('SELECT playlist_id FROM playlist_locks WHERE account_id=?', (account_id,))}
        if not row: return 0, None
        state = json.loads(row[1])
        locked_media = {media_id for playlist in state.get('playlists', []) if playlist.get('id') in locks for media_id in playlist.get('mediaIds', [])}
        # Bot access is intentionally narrower: no source credentials, history, channels, or locked media.
        fields = ('id', 'title', 'provider', 'kind', 'description', 'contentType', 'contentRating', 'year', 'genres', 'actors', 'durationSeconds', 'franchise', 'series', 'season', 'episode', 'tags')
        media = [{key: item[key] for key in fields if key in item} for item in state.get('media', []) if item.get('id') not in locked_media]
        playlists = [{'id': playlist.get('id'), 'name': playlist.get('name'), 'mediaIds': [item for item in playlist.get('mediaIds', []) if item not in locked_media]} for playlist in state.get('playlists', []) if playlist.get('id') not in locks]
        result = {'media': media, 'playlists': playlists, 'channels': []}
        return row[0], result

    def read_bot_sources(self, token):
        account_id = self.bot_session(token, 'sources:manage')
        if not account_id: raise PermissionError('bot source scope required')
        with closing(self.connect()) as db:
            row = db.execute('SELECT state FROM libraries WHERE account_id=?', (account_id,)).fetchone()
        if not row: return []
        sources = []
        for source in json.loads(row[0]).get('sources', []):
            try:
                url = urlsplit(source.get('url', ''))
                if url.scheme not in ('http', 'https') or not url.hostname: continue
                safe_url = urlunsplit((url.scheme, url.netloc.rsplit('@', 1)[-1], url.path, '', ''))
                sources.append({'id': source.get('id'), 'url': safe_url})
            except ValueError: continue
        return sources

    def bot_action(self, token, action, data):
        scope = {'source.add': 'sources:manage', 'source.remove': 'sources:manage', 'playlist.create': 'playlists:manage', 'playlist.replace': 'playlists:manage', 'playlist.delete': 'playlists:manage', 'channel.create': 'channels:manage'}.get(action)
        account_id = self.bot_session(token, scope) if scope else None
        if not account_id: raise PermissionError('bot action scope required')
        if not isinstance(data, dict): raise ValueError('invalid action')
        with closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            digest = hashlib.sha256(token.encode()).hexdigest()
            live_token = db.execute('SELECT scopes FROM bot_tokens WHERE token_hash=? AND account_id=? AND revoked_at IS NULL AND expires_at>?', (digest, account_id, int(time.time()))).fetchone()
            if not live_token or scope not in json.loads(live_token[0]): raise PermissionError('bot token revoked or expired')
            row = db.execute('SELECT revision,state FROM libraries WHERE account_id=?', (account_id,)).fetchone()
            revision, state = (row[0], json.loads(row[1])) if row else (0, {'media': [], 'playlists': [], 'channels': []})
            locked = {entry[0] for entry in db.execute('SELECT playlist_id FROM playlist_locks WHERE account_id=?', (account_id,))}
            locked_media = {media_id for playlist in state.get('playlists', []) if playlist.get('id') in locked for media_id in playlist.get('mediaIds', [])}
            available = {item.get('id') for item in state.get('media', [])} - locked_media
            result = {}
            if action == 'source.add':
                url = data.get('url')
                if not isinstance(url, str) or len(url) > 2048: raise ValueError('invalid source')
                try: parsed = urlsplit(url)
                except ValueError: raise ValueError('invalid source')
                if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password or parsed.fragment: raise ValueError('invalid source')
                host = parsed.hostname.lower().rstrip('.')
                if host == 'localhost' or host.endswith(('.localhost', '.local')): raise ValueError('private source not allowed for bot actions')
                try: address = ipaddress.ip_address(host)
                except ValueError:
                    if host.isdecimal(): raise ValueError('invalid source host')
                else:
                    if not address.is_global: raise ValueError('private source not allowed for bot actions')
                sources = state.setdefault('sources', [])
                if any(source.get('url') == url for source in sources): raise ValueError('duplicate source')
                source_id = 'source-' + secrets.token_urlsafe(18)
                sources.append({'id': source_id, 'url': url})
                result = {'id': source_id}
            elif action == 'source.remove':
                source_id = data.get('id')
                if not isinstance(source_id, str): raise ValueError('invalid source')
                sources = state.get('sources', [])
                if not any(source.get('id') == source_id for source in sources): raise ValueError('source not found')
                state['sources'] = [source for source in sources if source.get('id') != source_id]
            elif action in ('playlist.create', 'playlist.replace'):
                name, ids = data.get('name'), data.get('mediaIds')
                if not isinstance(name, str) or not name.strip() or len(name) > 100 or not isinstance(ids, list) or len(ids) > 5000 or any(not isinstance(item, str) or item not in available for item in ids) or len(set(ids)) != len(ids): raise ValueError('invalid playlist')
                if action == 'playlist.create':
                    playlist_id = 'playlist-' + secrets.token_urlsafe(18)
                    state['playlists'].insert(0, {'id': playlist_id, 'name': name.strip(), 'mediaIds': ids, 'createdAt': datetime.now(timezone.utc).isoformat()})
                else:
                    playlist_id = data.get('id')
                    if not isinstance(playlist_id, str) or playlist_id in locked: raise PermissionError('playlist locked')
                    playlist = next((entry for entry in state['playlists'] if entry.get('id') == playlist_id), None)
                    if not playlist: raise ValueError('playlist not found')
                    if any(item in locked_media for item in playlist.get('mediaIds', [])): raise PermissionError('playlist contains locked media')
                    playlist['name'], playlist['mediaIds'] = name.strip(), ids
                result = {'id': playlist_id}
            elif action == 'playlist.delete':
                playlist_id = data.get('id')
                if not isinstance(playlist_id, str) or playlist_id in locked: raise PermissionError('playlist locked')
                playlist = next((entry for entry in state['playlists'] if entry.get('id') == playlist_id), None)
                if not playlist: raise ValueError('playlist not found')
                if any(item in locked_media for item in playlist.get('mediaIds', [])): raise PermissionError('playlist contains locked media')
                state['playlists'] = [entry for entry in state['playlists'] if entry.get('id') != playlist_id]
                state['channels'] = [{**channel, 'playlistId': None, 'mediaIds': list(playlist.get('mediaIds', []))} if channel.get('playlistId') == playlist_id else channel for channel in state['channels']]
            elif action == 'channel.create':
                playlist_id = data.get('playlistId')
                if not isinstance(playlist_id, str) or playlist_id in locked: raise PermissionError('playlist locked')
                playlist = next((entry for entry in state['playlists'] if entry.get('id') == playlist_id), None)
                if not playlist or not playlist.get('mediaIds'): raise ValueError('empty or missing playlist')
                if any(item in locked_media for item in playlist.get('mediaIds', [])): raise PermissionError('playlist contains locked media')
                channel_id = 'channel-' + secrets.token_urlsafe(18)
                state['channels'].insert(0, {'id': channel_id, 'name': playlist['name'], 'description': 'Loops this playlist in order.', 'accent': '#8a7dff', 'filter': '', 'anchor': datetime.now(timezone.utc).isoformat(), 'durationHours': 24, 'playlistId': playlist_id})
                result = {'id': channel_id}
            serialized = json.dumps(state, separators=(',', ':'))
            if len(serialized.encode('utf-8')) > 8 * 1024 * 1024: raise ValueError('state too large')
            db.execute('INSERT OR REPLACE INTO libraries VALUES (?,?,?)', (account_id, revision + 1, serialized))
            return {**result, 'revision': revision + 1}

    def lock_playlist(self, token, playlist_id, pin):
        owner = self.session(token)
        if not owner or owner[2] != 'owner': raise PermissionError('owner required')
        if not isinstance(playlist_id, str) or len(playlist_id) > 256 or not isinstance(pin, str) or not pin.isascii() or not pin.isdigit() or not 4 <= len(pin) <= 12: raise ValueError('invalid passcode')
        with closing(self.connect()) as db, db:
            row = db.execute('SELECT state FROM libraries WHERE account_id=?', (owner[0],)).fetchone()
            if not row or not any(p.get('id') == playlist_id for p in json.loads(row[0]).get('playlists', [])): raise ValueError('playlist not found')
            salt = secrets.token_bytes(16)
            db.execute('INSERT OR REPLACE INTO playlist_locks VALUES (?,?,?,?)', (owner[0], playlist_id, salt, _derive(pin, salt)))
            db.execute('DELETE FROM playlist_unlocks WHERE playlist_id=? AND token_hash IN (SELECT token_hash FROM sessions WHERE account_id=?)', (playlist_id, owner[0]))

    def unlock_playlist(self, token, playlist_id, pin):
        session = self.session(token)
        if not session: raise PermissionError('session required')
        if not isinstance(playlist_id, str) or len(playlist_id) > 256 or not isinstance(pin, str) or len(pin) > 12: raise ValueError('invalid passcode')
        with closing(self.connect()) as db, db:
            row = db.execute('SELECT salt,secret FROM playlist_locks WHERE account_id=? AND playlist_id=?', (session[0], playlist_id)).fetchone()
            salt, expected = row if row else (bytes(16), bytes(32))
            if not hmac.compare_digest(_derive(pin, salt), expected) or not row: return False
            if session[2] == 'child' and playlist_id not in json.loads(session[3]).get('sharedPlaylistIds', []): return False
            digest = hashlib.sha256(token.encode()).hexdigest()
            db.execute('INSERT OR REPLACE INTO playlist_unlocks VALUES (?,?)', (digest, playlist_id))
            return True

    def read_library(self, token):
        session = self.session(token)
        if not session: raise PermissionError('session required')
        with closing(self.connect()) as db, db:
            row = db.execute('SELECT revision,state FROM libraries WHERE account_id=?', (session[0],)).fetchone()
            locks = {x[0] for x in db.execute('SELECT playlist_id FROM playlist_locks WHERE account_id=?', (session[0],))}
            unlocked = {x[0] for x in db.execute('SELECT playlist_id FROM playlist_unlocks WHERE token_hash=?', (hashlib.sha256(token.encode()).hexdigest(),))}
        if not row: return 0, None
        state = json.loads(row[1])
        state['playlists'] = [({'id': p.get('id'), 'name': 'Locked playlist', 'mediaIds': [], 'locked': True} if p.get('id') in locks - unlocked else p) for p in state.get('playlists', [])]
        if session[2] == 'child': state = child_library(state, json.loads(session[3]))
        return row[0], state

    def write_library(self, token, revision, state):
        session = self.session(token)
        if not session or session[2] == 'child': raise PermissionError('adult session required')
        if not isinstance(state, dict) or any(not isinstance(state.get(key), list) for key in ('media', 'playlists', 'channels')):
            raise ValueError('invalid state')
        if any(not isinstance(entry, dict) for key in ('media', 'playlists', 'channels') for entry in state[key]):
            raise ValueError('invalid state')
        if any(not isinstance(p.get('id'), str) or not isinstance(p.get('mediaIds'), list) for p in state['playlists']):
            raise ValueError('invalid playlist')
        with closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT revision,state FROM libraries WHERE account_id=?', (session[0],)).fetchone()
            current = row[0] if row else 0
            if revision != current: raise RuntimeError('revision_conflict')
            if row:
                locks = {x[0] for x in db.execute('SELECT playlist_id FROM playlist_locks WHERE account_id=?', (session[0],))}
                unlocked = {x[0] for x in db.execute('SELECT playlist_id FROM playlist_unlocks WHERE token_hash=?', (hashlib.sha256(token.encode()).hexdigest(),))}
                hidden = locks - unlocked
                original = json.loads(row[1])
                preserved = {p['id']: p for p in original.get('playlists', []) if p.get('id') in hidden}
                state = {**state, 'playlists': [preserved.get(p.get('id'), p) for p in state['playlists']] + [p for key, p in preserved.items() if all(x.get('id') != key for x in state['playlists'])]}
            serialized = json.dumps(state, separators=(',', ':'))
            if len(serialized.encode('utf-8')) > 8 * 1024 * 1024: raise ValueError('state too large')
            new_revision = current + 1
            db.execute('INSERT OR REPLACE INTO libraries VALUES (?,?,?)', (session[0], new_revision, serialized))
            return new_revision
