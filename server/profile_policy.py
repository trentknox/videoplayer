"""Server-side projection of a library for an authenticated child profile."""
from copy import deepcopy

# Conservative minimum ages; unrecognized or missing certifications do not pass.
CERTIFICATE_AGES = {
    'G': 0, 'PG': 8, 'PG-13': 13, 'R': 17, 'NC-17': 18,
    'TV-Y': 0, 'TV-Y7': 7, 'TV-G': 0, 'TV-PG': 8, 'TV-14': 14, 'TV-MA': 18,
}

def validate_child_policy(policy):
    if not isinstance(policy, dict): raise ValueError('invalid child policy')
    mode, max_age = policy.get('mode', 'approved_only'), policy.get('maxAge', 0)
    if mode not in ('approved_only', 'age_limit') or not isinstance(max_age, int) or isinstance(max_age, bool) or not 0 <= max_age <= 17:
        raise ValueError('invalid child policy')
    for key in ('approvedMediaIds', 'sharedPlaylistIds'):
        values = policy.get(key, [])
        if not isinstance(values, list) or len(values) > 100000 or any(not isinstance(value, str) or len(value) > 256 for value in values):
            raise ValueError('invalid child policy')

def child_library(state, policy):
    """Return only permitted titles and explicitly shared playlists.

    Policy supports 'approved_only' and 'age_limit'. In either mode an explicit
    title approval grants access; unknown ratings never qualify by age alone.
    """
    validate_child_policy(policy)
    approved = set(policy.get('approvedMediaIds') or [])
    shared_playlists = set(policy.get('sharedPlaylistIds') or [])
    mode = policy.get('mode', 'approved_only')
    max_age = policy.get('maxAge', 0)
    allowed = []
    for item in state.get('media', []):
        if not isinstance(item, dict) or not isinstance(item.get('id'), str):
            continue
        certificate = str(item.get('contentRating') or '').strip().upper()
        rating_age = CERTIFICATE_AGES.get(certificate)
        if item['id'] in approved or (mode == 'age_limit' and not item.get('adult', False) and rating_age is not None and rating_age <= max_age):
            allowed.append(deepcopy(item))
    allowed_ids = {item['id'] for item in allowed}
    playlists = []
    for playlist in state.get('playlists', []):
        if not isinstance(playlist, dict) or playlist.get('id') not in shared_playlists:
            continue
        copy = deepcopy(playlist)
        copy['mediaIds'] = [item_id for item_id in playlist.get('mediaIds', []) if item_id in allowed_ids]
        playlists.append(copy)
    # Sources, unscreened channels, scan cursors, and private settings are omitted.
    return {'media': allowed, 'playlists': playlists, 'channels': []}
