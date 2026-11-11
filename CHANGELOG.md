# Changelog

What changed, in plain language. Newest first.

## Unreleased 1.0.0

- Admin panel: confirming the owner password now works when the Terms of Service need accepting again (a tick box appears), and when something goes wrong the dialog says why (wrong password, too many tries, GLL ID not reachable).
- Limitless now opens much faster, especially the second time: the big parts of the app are separate files that your browser keeps, so a repeat visit has a lot less to download and read.
- Pages now appear as soon as their text, styles and scripts are ready. Images keep loading after the page is shown, so one slow picture no longer holds the whole page back.
- The page you were on stays visible and usable while the next one loads. A thin progress bar under the address bar shows how far the load has come, instead of covering the page.
- Pictures far down a page now load only when you scroll close to them, which saves time and data.
- When many people are online at once, Limitless now tells you once per visit that "The line is busy, Data saver helps". It never turns Data saver on for you.
- New Data saver setting (Settings, Connection): asks sites for lighter pages, loads pictures only near the screen, and stops videos from starting by themselves. It is off by default.
- Sites you visit again open faster: Limitless now remembers the prepared scripts of a site between visits (only when the Resource Cache setting is on).
- Back and Forward are now instant for the last few pages in each tab: they come straight from memory, with the scroll position where you left it.
- Pages you opened recently show up at once on the next visit, then quietly check for a newer version. If you have already started reading, a small "Updated, reload" button offers the new version instead of changing the page under you.
- Tabs you have not used for a while now go to sleep to save memory (Settings, Tab Caching: choose Never, 10, 30 or 60 minutes). They wake in a moment, at the same spot. Tabs playing sound or video, or holding text you typed, never sleep.
- The main app code is now its own file that your browser keeps between visits, so Limitless starts faster on a repeat open and each update only has to fetch what changed.
- Pages with many fonts and images in their styles are prepared faster, without stalling the page.

- Opening the app and new connections is a little quicker: the server remembers a successful sign-in check for a few seconds instead of asking again for every file.
- Site addresses are looked up through a small cache on our side, so the second visit to a site starts sooner.
- The relay has more memory and processor time, which helps when several people browse at once.

## 0.2.3

- The legal page now points to the full Gamble Limited legal documents on HALL.

## 0.2.2

- Fixed: Close in the admin panel now only closes the panel and takes you back to the page you were on, instead of replacing the tab with the start page.

## 0.2.1

- Fixed: after the update, pages could fail with "libcurl not ready" while an older Limitless tab was still open. Limitless now starts without its cache in that case instead of waiting.
- Fixed: the admin panel now has a Close button and goes away when you press Home.

## 0.2.0

- Faster page loads: the speed limit used to apply to each connection, which slowed everything down. It is now one fair limit per account, shared across all of your connections.
- Faster browsing: up to 24 requests run at the same time (at most 6 to any one site), instead of 10. You can change this in Settings > Connection.
- Faster connections: Limitless now opens up to four connections to its own relay instead of one, so one slow download no longer holds up the others. You can change the number in Settings > Connection.
- Repeat visits are quicker: Limitless keeps a cache of page files on your device (up to 200 MB). It follows each site's own rules, never keeps pages a site marks as private, and checks with the site before reusing a file that has expired. You can turn it off or clear it in Settings.
- Big scripts on a page are now prepared in the background, so busy pages stay responsive while they load.
- New, optional: use several third-party relays at once (Settings > Connection). It is off by default and only works if you have allowed third-party relays. Those relays are run by other operators and can see which sites you visit. Spread mode can sign you out of sites or trigger bot checks.
- Admin panel for the owner, inside Limitless Browser (Admin panel in Settings > About). Approve and revoke people, see who is using how much, set limits for one person, cut someone off, pause new sign-ins, switch on maintenance mode, and check that everything is running. Only the owner sees it.

## 0.1.0 (unreleased)

- New Limitless look, with eight themes, each in light and dark (Vault is dark only). Pick a theme, light or dark, and a mark in Settings > Appearance, or from the Theme button in the toolbar.
- New start page.
- Sign in with GLL ID. Limitless Browser is invite only: only approved people can use it.
- Our own relay for connections, instead of public ones.
- Removed the Discord client, the new-tab widgets, the AI assistant and translate.
- Faster loading: pages are sent compressed, and fonts and icons are hosted with the app.
- A notice appears when a new version is available, with a What's new page that lists the changes.
