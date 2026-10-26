# Vivid Media Player

An original, MIT-licensed media-center web app and Windows desktop shell. Vivid gives you one modern place to keep permitted video sources, direct streams, playlists, and time-based virtual channels without copying the underlying media.

## What works in v0.1

- A local-first Netflix-style library saved in IndexedDB, with JSON backup/restore.
- An importer for YouTube videos/playlists/channels, Twitch videos/channels, Plex source records, Cloudflare Stream, direct MP4/WebM/HLS URLs, and permitted standard public-page embed metadata.
- A provider-neutral player surface: native video/HLS where the source permits it, and provider-hosted player embeds elsewhere.
- Playlists, tags, franchises, series, seasons, episodes, actors, and filters.
- Virtual 24/7 channels that generate a shared, deterministic schedule from the library. They select the right source for the current time; they do not transcode, copy, proxy, or rebroadcast it.
- A static build ready for Cloudflare Pages and an Electron/NSIS Windows installer configuration.

## Run it locally

```powershell
npm install
npm run dev
```

Open the local Vite URL shown in the terminal. To run the desktop shell:

```powershell
npm run desktop
```

To build an unsigned Windows installer:

```powershell
npm run make:win
```

The installer output is placed in `release/`. Production distribution should use a proper Windows code-signing certificate so Windows SmartScreen can establish reputation.

## Deploy to Cloudflare Pages

```powershell
npm run build
npx wrangler pages deploy dist --project-name=vivid-media-player
```

The Pages build is static and stores a viewer's library only in their browser. It contains no Plex or provider credentials. A future Cloudflare Workers/D1 layer can add accounts and shared catalogs.

## Cloudflare Stream

Paste a Cloudflare Stream video, live-input, player, or manifest link into the importer. Vivid recognizes Cloudflare Stream and uses the provider's own player URL. That makes Stream a good fit for video you own or are licensed to publish, including live inputs, while keeping Stream tokens and account secrets out of the Pages application. See the [Cloudflare Stream player guide](https://developers.cloudflare.com/stream/viewing-videos/using-the-stream-player/).

## Import boundary

For ordinary public pages, the optional analyzer looks only for normal public metadata and elements such as `og:video`, `VideoObject`, `video`, `source`, and `iframe`. It refuses private/local addresses and does not evade DRM, authentication, paywalls, robots controls, signed-URL controls, CORS, or rate limits. For a full catalog, connect a provider-approved API, RSS feed, sitemap, or an owned-server index.

## Open-source research

The current top-ten landscape ranking, methodology, licenses, and implementation takeaways are in [docs/open-source-landscape.md](docs/open-source-landscape.md). GPL/AGPL applications are useful reference products but cannot be copied into this MIT project.
