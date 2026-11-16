# Blocklist source

- List: HaGeZi Multi NORMAL, domains-only build ("wildcard/multi-onlydomains.txt"), version 2026.1115.2322.23, fetched 2026-11-15. It replaces Multi LIGHT (folder `2026-11-14`, kept until 1.0 ships).
- Source: https://github.com/hagezi/dns-blocklists (file https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard/multi-onlydomains.txt).
- Licence: GNU GPL v3.0, full text in `LICENSE` next to this file (same text as the Light folder). The list may be redistributed under GPL-3.0 and the licence text must accompany it. GPL-3.0 combines with this project's AGPL-3.0 (GPL-3.0 section 13). Some inputs come from third-party sources with their own terms; GPL-3.0 covers the list as published, not those upstream sources.
- Content: ads, trackers, metrics, telemetry and some badware (all-round protection). 223869 entries, 4571161 bytes (about 4.4 MB raw, about 1.5 MB gzip, about 1.4 MB brotli; the build ships both). Light was 91336 entries and 1.9 MB raw.
- Format: one registrable-or-subdomain per line, `#` comment lines. A host is blocked when it or any parent domain is in the list (`app/main.js`, `LB_blocklist`).
- Update: fetch the same file on release day, put it in a new `vendor/blocklist/<date>/` folder, and change `FILE` in `LB_blocklist`. Never edit a dated folder.
