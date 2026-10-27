# Self-hosting work in progress

Vivid's public web app currently stores the library in the browser. A private VPS backend is being developed; the account, profile, playlist-lock and sync code in `server/` is not yet connected to the web app and should not be considered a finished deployment.

The backend uses Python's standard library and SQLite. The Vivid gateway defaults to loopback and expects a separately configured Hermes-compatible service. Its origin, local listener, database, upstream URL, token-file paths and free-model ladder can be configured with `VIVID_ALLOWED_ORIGINS`, `VIVID_BIND`, `VIVID_PORT`, `VIVID_DB_FILE`, `VIVID_HERMES_URL`, `VIVID_TOKEN_FILE`, `VIVID_UPSTREAM_TOKEN_FILE` and `VIVID_MODELS`. Never place service tokens in a web bundle or expose the gateway without HTTPS and authentication.

`python server/manage_accounts.py` creates an account locally using an interactive passcode prompt. It does not accept the passcode as a command-line argument. The prototype tests cover account isolation, child-profile filtering, locked playlists, fallback models and concurrent-write conflicts; these do not yet establish production readiness or a complete parental-control system. Source-provided age ratings can be wrong, and third-party players or other browser applications are outside Vivid's controls.
