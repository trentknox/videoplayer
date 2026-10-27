# Vivid agent API (prototype)

Agent tokens grant only the scopes selected by an owner. The token is shown once, stored server-side as a hash, expires after 30 days by default, and can be revoked by the owner. Treat it like a password. The account-enabled server is private. Browser sync is available after an owner signs in; these endpoints are not publicly exposed by default.

Use an authenticated HTTPS endpoint for deployed instances. `VIVID_URL` is the server base URL, and `VIVID_TOKEN` is the agent token stored securely by the caller. Never embed tokens in a public web app, command-line history, or shared URLs.

- `library:read`: `GET /v1/state` returns permitted library metadata and unlocked playlist entries. Source URLs, history, channels, and media belonging to locked playlists are omitted.
- `sources:manage`: `GET /v1/bot/sources` lists source IDs and redacted URLs. `POST /v1/bot/actions` supports `source.add` with `{ "url": "https://example.com/catalog" }` and `source.remove` with `{ "id": "..." }`. Bot-added sources cannot target localhost or private IP addresses; users can manage private sources themselves.
- `playlists:manage`: the actions `playlist.create`, `playlist.replace`, and `playlist.delete` manage unlocked playlists. Create or replace uses `{ "name": "Favorites", "mediaIds": ["..."] }`; replace also requires `id`. Locked playlists and media cannot be modified through these actions.
- `channels:manage`: `channel.create` accepts `{ "playlistId": "..." }` for an existing unlocked playlist. It creates a looping virtual channel.
- `inference`: `POST /v1/infer` uses the server's configured model; it does not add or configure a user's inference provider.

For actions, POST `{ "action": "source.add", "data": { "url": "https://example.com/catalog" } }` with `Authorization: Bearer <token>`. Mutations are serialized in the account database and return the new revision. A bot token cannot create or revoke tokens, change profile policies, access locked content, or grant itself additional scopes.

The prototype exposes only a limited metadata view to agents; it does not provide credential-bearing playback URLs. Bot changes reach signed-in browser libraries through private synchronization; provider-specific authorization may still be needed for playback.
