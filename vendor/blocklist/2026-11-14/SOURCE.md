# Blocklist source

- List: HaGeZi Multi LIGHT, domains-only build ("wildcard/light-onlydomains.txt"), version 2026.1114.2326.08, fetched 2026-11-14.
- Source: https://github.com/hagezi/dns-blocklists (file https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard/light-onlydomains.txt).
- Licence: GNU GPL v3.0, full text in `LICENSE` next to this file (copied from the repository). The README of the list states that it may be redistributed under GPL-3.0 and that the licence text must accompany it. GPL-3.0 combines with this project's AGPL-3.0 (GPL-3.0 section 13). The README also notes that some inputs come from third-party sources with their own terms; GPL-3.0 covers the list as published, not those upstream sources.
- Content: ads, trackers, metrics, telemetry and some badware, built only from domains seen on the Top 1M/10M lists. 91336 entries, 1961240 bytes (about 1.9 MB raw, about 0.6 MB compressed; the build ships gzip and brotli).
- Why this list: GPL-3.0 is stated clearly for the whole list; other candidates were rejected because of unclear or mixed licences (Peter Lowe, OISD, StevenBlack unified, AdGuard DNS) or mixed content (malware, adult, social). Light is the smallest HaGeZi ads and trackers tier, which keeps breakage low.
- Format: one registrable-or-subdomain per line, `#` comment lines. A host is blocked when it or any parent domain is in the list (`app/main.js`, `LB_blocklist`).
- Update: fetch the same file on release day, put it in a new `vendor/blocklist/<date>/` folder, and change `FILE` in `LB_blocklist`. Never edit a dated folder.
