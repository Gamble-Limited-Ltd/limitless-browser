# Changelog

What changed, in plain language. Newest first.

## 0.2.0 (unreleased)

- Faster browsing: up to 24 requests run at the same time (at most 6 to any one site), instead of 10. You can change this in Settings > Connection.
- Faster connections: Limitless now opens up to four connections to its own relay instead of one, so one slow download no longer holds up the others. You can change the number in Settings > Connection.
- Repeat visits are quicker: Limitless keeps a cache of page files on your device (up to 200 MB). It follows each site's own rules, never keeps pages a site marks as private, and checks with the site before reusing a file that has expired. You can turn it off or clear it in Settings.
- Big scripts on a page are now prepared in the background, so busy pages stay responsive while they load.
- New, optional: use several third-party relays at once (Settings > Connection). It is off by default and only works if you have allowed third-party relays. Those relays are run by other operators and can see which sites you visit. Spread mode can sign you out of sites or trigger bot checks.

## 0.1.1 (unreleased)

- Faster page loads: the speed limit used to apply to each connection, which slowed everything down. It is now one fair limit per account, shared across all of your connections.

## 0.1.0 (unreleased)

- New Limitless look, with eight themes, each in light and dark (Vault is dark only). Pick a theme, light or dark, and a mark in Settings > Appearance, or from the Theme button in the toolbar.
- New start page.
- Sign in with GLL ID. Limitless Browser is invite only: only approved people can use it.
- Our own relay for connections, instead of public ones.
- Removed the Discord client, the new-tab widgets, the AI assistant and translate.
- Faster loading: pages are sent compressed, and fonts and icons are hosted with the app.
- A notice appears when a new version is available, with a What's new page that lists the changes.
