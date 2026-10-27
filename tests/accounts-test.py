import sys
import tempfile
import concurrent.futures
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / 'server'))
from accounts import Accounts

class AccountsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='vivid-accounts-test-', dir=HERE)
        self.directory = Path(self.temp.name).resolve()
        assert self.directory.parent == HERE
        self.accounts = Accounts(self.directory / 'accounts.sqlite3')

    def tearDown(self):
        assert self.directory.parent == HERE
        self.temp.cleanup()

    def test_large_library_can_sync(self):
        self.accounts.create_account('large-library', 'strong-password')
        token = self.accounts.login_owner('large-library', 'strong-password')
        state = {'media': [{'id': 'large', 'description': 'x' * (9 * 1024 * 1024)}], 'playlists': [], 'channels': []}
        self.assertEqual(self.accounts.write_library(token, 0, state), 1)
        revision, restored = self.accounts.read_library(token)
        self.assertEqual(revision, 1)
        self.assertEqual(len(restored['media'][0]['description']), 9 * 1024 * 1024)

    def test_account_isolation_profiles_and_conflicts(self):
        self.accounts.create_account('family', 'strong-password')
        self.accounts.create_account('other', 'other-password')
        owner = self.accounts.login_owner('family', 'strong-password')
        other = self.accounts.login_owner('other', 'other-password')
        self.assertIsNone(self.accounts.login_owner('family', 'incorrect'))
        child_id = self.accounts.create_profile(owner, 'Kids', '1234', 'child', {'mode': 'age_limit', 'maxAge': 13, 'sharedPlaylistIds': ['shared']})
        self.assertIsNone(self.accounts.login_profile('family', 'Kids', '0000'))
        child = self.accounts.login_profile('family', 'Kids', '1234')
        self.assertIsNone(self.accounts.login_profile('other', 'Kids', '1234'))
        state = {'media': [{'id': 'pg', 'contentRating': 'PG'}, {'id': 'adult', 'contentRating': 'TV-MA'}, {'id': 'unknown'}], 'playlists': [{'id': 'shared', 'mediaIds': ['pg', 'adult', 'unknown']}], 'channels': [], 'sources': [{'url': 'private'}]}
        self.assertEqual(self.accounts.write_library(owner, 0, state), 1)
        with self.assertRaises(RuntimeError): self.accounts.write_library(owner, 0, state)
        with self.assertRaises(PermissionError): self.accounts.write_library(child, 1, state)
        with self.assertRaises(PermissionError): self.accounts.create_profile(child, 'Escalation', '1234', 'adult')
        with self.assertRaises(PermissionError): self.accounts.update_child_policy(child, child_id, {'mode': 'approved_only'})
        self.assertEqual(self.accounts.read_library(other), (0, None))
        revision, child_state = self.accounts.read_library(child)
        self.assertEqual(revision, 1)
        self.assertEqual([item['id'] for item in child_state['media']], ['pg'])
        self.assertEqual(child_state['playlists'][0]['mediaIds'], ['pg'])
        self.assertNotIn('sources', child_state)
        self.assertNotIn(b'strong-password', self.accounts.path.read_bytes())
        self.assertNotIn(owner.encode(), self.accounts.path.read_bytes())
        self.accounts.logout(child)
        with self.assertRaises(PermissionError): self.accounts.read_library(child)

    def test_bot_tokens_are_scoped_revocable_and_cannot_access_locked_content(self):
        self.accounts.create_account('family', 'strong-password')
        self.accounts.create_account('other', 'other-password')
        owner = self.accounts.login_owner('family', 'strong-password')
        other = self.accounts.login_owner('other', 'other-password')
        state = {'media': [{'id': 'public', 'title': 'Public', 'sourceUrl': 'https://example.test/?token=secret'}, {'id': 'private', 'title': 'Private'}], 'playlists': [{'id': 'locked', 'name': 'Private list', 'mediaIds': ['private']}, {'id': 'shared', 'name': 'Shared', 'mediaIds': ['public', 'private']}], 'channels': [], 'sources': [{'id': 's', 'url': 'https://example.test/?key=secret'}]}
        self.accounts.write_library(owner, 0, state)
        self.accounts.lock_playlist(owner, 'locked', '4321')
        created = self.accounts.create_bot_token(owner, 'Agent', ['library:read', 'playlists:manage', 'channels:manage', 'sources:manage'])
        bot = created['token']
        self.assertNotIn(bot.encode(), self.accounts.path.read_bytes())
        self.assertNotIn('token', self.accounts.list_bot_tokens(owner)[0])
        self.assertEqual(self.accounts.list_bot_tokens(other), [])
        _, visible = self.accounts.read_bot_library(bot)
        self.assertEqual([x['id'] for x in visible['media']], ['public'])
        self.assertNotIn('sourceUrl', visible['media'][0])
        self.assertEqual(visible['playlists'][0]['mediaIds'], ['public'])
        self.assertNotIn('sources', visible)
        self.assertEqual(self.accounts.read_bot_sources(bot)[0]['url'], 'https://example.test/')
        with self.assertRaises(ValueError): self.accounts.bot_action(bot, 'source.add', {'url': 'http://127.0.0.1/private'})
        with self.assertRaises(PermissionError): self.accounts.bot_action(bot, 'playlist.delete', {'id': 'locked'})
        with self.assertRaises(ValueError): self.accounts.bot_action(bot, 'playlist.create', {'name': 'Leak', 'mediaIds': ['private']})
        playlist = self.accounts.bot_action(bot, 'playlist.create', {'name': 'Agent playlist', 'mediaIds': ['public']})
        channel = self.accounts.bot_action(bot, 'channel.create', {'playlistId': playlist['id']})
        self.assertTrue(channel['id'].startswith('channel-'))
        self.assertFalse(self.accounts.revoke_bot_token(other, created['id']))
        self.assertTrue(self.accounts.revoke_bot_token(owner, created['id']))
        self.assertIsNone(self.accounts.bot_session(bot, 'library:read'))
        with self.assertRaises(PermissionError): self.accounts.bot_action(bot, 'source.add', {'url': 'https://example.test/'})

    def test_simultaneous_updates_do_not_silently_overwrite(self):
        self.accounts.create_account('family', 'strong-password')
        token = self.accounts.login_owner('family', 'strong-password')
        def write(title):
            try:
                return self.accounts.write_library(token, 0, {'media': [{'id': title}], 'playlists': [], 'channels': []})
            except RuntimeError:
                return 'conflict'
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(write, ['first', 'second']))
        self.assertEqual(sorted(map(str, outcomes)), ['1', 'conflict'])
        self.assertEqual(self.accounts.read_library(token)[0], 1)

    def test_locked_playlist_stays_hidden_and_is_preserved_during_other_edits(self):
        self.accounts.create_account('family', 'strong-password')
        owner = self.accounts.login_owner('family', 'strong-password')
        state = {'media': [{'id': 'movie'}], 'playlists': [{'id': 'locked', 'name': 'Private playlist', 'mediaIds': ['movie']}], 'channels': []}
        self.accounts.write_library(owner, 0, state)
        self.accounts.lock_playlist(owner, 'locked', '4321')
        revision, hidden = self.accounts.read_library(owner)
        self.assertEqual(hidden['playlists'][0]['name'], 'Locked playlist')
        self.assertEqual(hidden['playlists'][0]['mediaIds'], [])
        self.assertFalse(self.accounts.unlock_playlist(owner, 'locked', '0000'))
        hidden['channels'].append({'id': 'new'})
        self.accounts.write_library(owner, revision, hidden)
        self.assertTrue(self.accounts.unlock_playlist(owner, 'locked', '4321'))
        _, visible = self.accounts.read_library(owner)
        self.assertEqual(visible['playlists'][0]['mediaIds'], ['movie'])
        self.assertEqual(visible['playlists'][0]['name'], 'Private playlist')

if __name__ == '__main__': unittest.main()
