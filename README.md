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

### Automatic Windows updates

Installed Windows builds check the `trentknox/videoplayer` GitHub Releases feed on startup and every six hours, download newer stable releases, and install them when the app closes. Electron Builder produces the installer and `latest.yml` metadata for the release. Publish both artifacts on a GitHub Release with a higher version number.

For safety, automatic updates only run when the installed build contains a verified Windows publisher name generated from a configured signing certificate. The current unsigned development build does not automatically install updates. Configure Windows Authenticode signing before distributing an update-enabled build; users must install that signed build once before it can update itself. A new installer is never downloaded or executed automatically by an unsigned build.

## Deploy to Cloudflare Pages

```powershell
npm run build
npx wrangler pages deploy web-dist --project-name=vivid-media-player
```

The public Pages app stores its library in the browser by default. When a viewer connects an account-enabled private Vivid gateway, it can synchronize library data to that user's server and issue scoped, revocable agent tokens. Provider credentials are not included in the public build. The server is loopback-only by default; see [self-hosting status](docs/self-hosting.md).

## Cloudflare Stream

Paste a Cloudflare Stream video, live-input, player, or manifest link into the importer. Vivid recognizes Cloudflare Stream and uses the provider's own player URL. That makes Stream a good fit for video you own or are licensed to publish, including live inputs, while keeping Stream tokens and account secrets out of the Pages application. See the [Cloudflare Stream player guide](https://developers.cloudflare.com/stream/viewing-videos/using-the-stream-player/).

## Import boundary

For ordinary public pages, the optional analyzer reads public metadata and elements (primary `og:` and `twitter:` tags, `<meta>` values, `<video>`/`<source>`/`<iframe>` sources, and `<a href>` listings) without whitelisting any single provider. It refuses protocols other than `http(s)`; it does not test hosts against private or local networks. It does not evade DRM, authentication, paywalls, robots controls, signed-URL controls, CORS, or rate limits. For a full catalog, connect a provider-approved API, RSS feed, sitemap, or an owned-server index.

## Open-source research

The current top-ten landscape ranking, methodology, licenses, and implementation takeaways are in [docs/open-source-landscape.md](docs/open-source-landscape.md). GPL/AGPL applications are useful reference products but cannot be copied into this MIT project.
