# Vivid reference feature map

The user wants Vivid to combine the relevant capabilities of these products. This is a roadmap, not a statement that Vivid already implements them.

## Multi-stream viewing

[ViewGrid](https://viewgrid.tv/about) describes a cross-platform grid, independent audio, shared layouts, discovery, followed channels, events, and TV/mobile apps. Vivid needs a saved and shareable grid, layout and audio controls, provider-specific embeds, live discovery, and device-friendly controls. Provider APIs and embed restrictions still need individual verification.

## Live discovery

[WhosLive](https://whoslive.io/) lists live streams by platform, language and category, plus followed creators; its [privacy documentation](https://whoslive.io/privacy-policy.html) describes linked accounts and YouTube live chat. Vivid needs provider-backed live status, search, categories, follows and notifications. Linked accounts and chat require separate authorization and provider-specific capabilities.

## Channel surfing

[Channel Surfer](https://channelsurfer.tv/help/getting-started/) describes a schedule guide, channel switching, favorites, keyboard controls, reminders, captions, and source imports. Vivid has locally generated schedules; guide controls are being added. Persistent channel numbers, favorites, notifications, provider-native captions, and verified cross-device schedules remain to be implemented.

## Personal media-server lineups

[Coax](https://www.coaxtheapp.com/) turns Plex, Jellyfin, and Emby libraries into a linear guide. Its lineups combine libraries and collections, filter by genre, age and date, and support direct play with server-side transcoding where needed. It also offers parental controls, captions and multiple audio tracks. Vivid needs authenticated connectors and real library synchronization for each server, lineup rules and schedule generation, and compatible stream/subtitle selection; saving a server URL alone is not an integration.

[Bunny Ears TV](https://www.bunnyearstv.com/) adds Plex-backed movie, television and music channels, radio, a guide that stays visible during playback, profiles and PINs, and playback selection for local and remote connections. Its [custom channels](https://www.bunnyearstv.com/features/custom-channels) use playlists and collections with scheduling controls. Vivid needs the authenticated Plex integration, music and radio sources, profile enforcement, customizable channel identity and scheduling, plus compatible playback paths before claiming parity.

## Foundation requirements

Private self-hosted accounts, child profiles, playlist passcodes, sync, and AI search/tagging must be enforced by the backend before they can be represented as complete. Unknown age ratings must not silently become child-safe. External providers can impose their own embed, playback, authentication, and availability restrictions.
