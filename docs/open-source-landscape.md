# Open-source player landscape

Snapshot: 2026-10-26. These are research references, not code dependencies. Vivid is an original MIT-licensed project; GPL/AGPL source is not copied into this repository.

## Ranking method

The score uses 60% normalized logarithmic GitHub stars and 40% normalized logarithmic pull-request activity opened from 2025-10-26 through 2026-10-26. The logarithm avoids making a single unusually popular project overwhelm evidence of active maintenance. VLC is the one exception: its GitHub repository points active development to VideoLAN GitLab, so its GitLab merge-request count is used instead of its empty GitHub PR count.

| Rank | Project | License | Stars | Recent PR/MR activity | Why it matters |
| --- | --- | --- | ---: | ---: | --- |
| 1 | [yt-dlp](https://github.com/yt-dlp/yt-dlp) | Unlicense | 202,552 | 928 | Source-resolver reference, not a player or library. |
| 2 | [Jellyfin](https://github.com/jellyfin/jellyfin) | GPL-2.0 | 58,645 | 1,445 | Best self-hosted Plex-style library/server product reference. |
| 3 | [VLC](https://github.com/videolan/vlc) | GPL-2.0 | 20,239 | 2,639 MRs | Mature direct-stream and codec/playback reference. |
| 4 | [Kodi](https://github.com/xbmc/xbmc) | GPLv2 | 21,388 | 2,125 | Strong media-center, library, and add-on architecture reference. |
| 5 | [mpv](https://github.com/mpv-player/mpv) | GPLv2+ by default; LGPL optional build | 37,575 | 898 | Excellent embeddable playback core and scripting reference. |
| 6 | [Navidrome](https://github.com/navidrome/navidrome) | GPL-3.0 | 24,381 | 984 | Strong self-hosted library/server reference, focused on music. |
| 7 | [FreeTube](https://github.com/FreeTubeApp/FreeTube) | AGPL-3.0 | 22,152 | 921 | YouTube desktop UX reference; provider-specific. |
| 8 | [Stremio Web](https://github.com/Stremio/stremio-web) | GPLv2 | 14,808 | 370 | Add-on-driven aggregation UX reference. |
| 9 | [MPC-HC](https://github.com/clsid2/mpc-hc) | GPL-3.0 | 16,020 | 274 | Mature Windows native-player reference. |
| 10 | [Streamlink](https://github.com/streamlink/streamlink) | BSD-2-Clause | 11,868 | 359 | Live-stream-to-player adapter reference. |

Near miss: [Universal Media Server](https://github.com/UniversalMediaServer/UniversalMediaServer) (GPL-2.0, 2,667 stars, 488 recent PRs) ranked eleventh under the same formula and is a useful DLNA/UPnP server reference.

## What Vivid takes from the landscape

- Jellyfin, Kodi, and Stremio inform the catalog, collection, and media-center experience.
- VLC and mpv inform what a future native playback layer should support.
- yt-dlp and Streamlink demonstrate provider-adapter patterns, but Vivid deliberately does not use them to defeat DRM, login gates, or source restrictions.
- The implemented web player uses provider-approved embeds, direct browser-playable URLs, and user-controlled local library metadata.
