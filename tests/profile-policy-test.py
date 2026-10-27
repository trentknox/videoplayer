import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'server'))
from profile_policy import child_library

class ChildPolicyTest(unittest.TestCase):
    def setUp(self):
        self.state = {
            'media': [{'id': 'safe', 'contentRating': 'PG'}, {'id': 'unknown'}, {'id': 'adult', 'contentRating': 'TV-MA', 'adult': True}],
            'playlists': [{'id': 'shared', 'mediaIds': ['safe', 'unknown', 'adult']}, {'id': 'private', 'mediaIds': ['safe']}],
            'channels': [{'name': 'private'}], 'sources': [{'url': 'https://private.example/'}],
        }

    def test_approved_only_does_not_expose_unapproved_data(self):
        result = child_library(self.state, {'mode': 'approved_only', 'approvedMediaIds': ['unknown'], 'sharedPlaylistIds': ['shared']})
        self.assertEqual([x['id'] for x in result['media']], ['unknown'])
        self.assertEqual(result['playlists'][0]['mediaIds'], ['unknown'])
        self.assertNotIn('sources', result)
        self.assertEqual(result['channels'], [])

    def test_age_limit_blocks_unknown_and_adult_by_default(self):
        result = child_library(self.state, {'mode': 'age_limit', 'maxAge': 13, 'sharedPlaylistIds': ['shared']})
        self.assertEqual([x['id'] for x in result['media']], ['safe'])
        self.assertEqual(result['playlists'][0]['mediaIds'], ['safe'])

    def test_invalid_policy_fails_closed(self):
        with self.assertRaises(ValueError): child_library(self.state, {'mode': 'age_limit', 'maxAge': 99})

if __name__ == '__main__': unittest.main()
