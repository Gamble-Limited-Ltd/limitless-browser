# Changelog

What changed, in plain language. Newest first.

## Next (1.0)

- New Downloads panel in the menu: a queue with progress, pause and resume, retry and cancel. Files over your plan's size limit, or over 2 GB, are refused before they start.

## 0.3.0

- Limitless now browses through public relays, run by other operators, until Limitless 1.0 brings its own relay. They can see connection metadata, such as which sites you connect to, but not what is inside secure (https) connections. You see a short note about this the first time you open Limitless, and Settings, Connection shows "Public relays (until 1.0)".
- If every public relay stops answering, a small note says so, links to the status page and keeps trying by itself.
- Limitless now checks your access before it connects to anything. If you are signed out you go to the sign-in page, and if you are offline you see "Cannot reach Limitless" instead of a half working page.
- The list of public relays was cleaned up: six that no longer work with Limitless were removed.
- Remembering pages for the next visit and warming up favourite sites are switched off for now. They come back in a later release.
- Ad and tracker blocking now uses a maintained list of about 90,000 domains and checks them much faster. A site is blocked when its address, or the main domain above it, is on the list. Similar-looking names and links that only mention a blocked name are not blocked. Your own filters and the per-site exceptions work as before.
- Updated the built-in network library (libcurl.js 0.7.5): newer curl and HTTP/2 code and a refreshed certificate list, including the fix for compromised certificate authorities.
- A slow or failing script on a page is no longer loaded straight from the site, outside the relay, which could expose your own connection. The page now shows without it and the script is added through Limitless when it arrives.
- Pages that look for their own script (cookie banners on several news and learning sites) now find it, so those banners no longer break. Pictures that a site forbids us to keep are no longer downloaded twice, and big pages hand out their picture slots faster.
- Fixed answers from the page's helper code being ignored in the new page runtime (replies to page requests, streams and cookies could be lost).
- Admin panel: confirming the owner password now works when the Terms of Service need accepting again (a tick box appears), and when something goes wrong the dialog says why (wrong password, too many tries, GLL ID not reachable).
- Limitless now opens much faster, especially the second time: the big parts of the app are separate files that your browser keeps, so a repeat visit has a lot less to download and read.
- Pages now appear as soon as their text, styles and scripts are ready. Images keep loading after the page is shown, so one slow picture no longer holds the whole page back.
- The page you were on stays visible and usable while the next one loads. A thin progress bar under the address bar shows how far the load has come, instead of covering the page.
- Pictures far down a page now load only when you scroll close to them, which saves time and data.
- New Data saver setting (Settings, Connection): asks sites for lighter pages, loads pictures only near the screen, and stops videos from starting by themselves. It is off by default.
- Sites you visit again open faster: Limitless now remembers the prepared scripts of a site between visits (only when the Resource Cache setting is on).
- Back and Forward are now instant for the last few pages in each tab: they come straight from memory, with the scroll position where you left it.
- Tabs you have not used for a while now go to sleep to save memory (Settings, Tab Caching: choose Never, 10, 30 or 60 minutes). They wake in a moment, at the same spot. Tabs playing sound or video, or holding text you typed, never sleep.
- The main app code is now its own file that your browser keeps between visits, so Limitless starts faster on a repeat open and each update only has to fetch what changed.
- Pages with many fonts and images in their styles are prepared faster, without stalling the page.
- A page that cannot reach one of its sites (a dead tracker or ad address, a wrong name) no longer resets your connection to the relay, so the rest of the page keeps loading.
- Error pages for a mistyped or missing site now appear at once with the right reason, instead of after several automatic retries.
- A form you send is never sent twice by the automatic retry.
- A request that never gets an answer is now stopped after a while, so it no longer holds up the pictures and scripts behind it.
- Long pages no longer lose pictures when many are waiting to load.
- Pictures and files reach the page without being converted to text first, which saves work on slower computers.
- The log panel no longer slows loading while it is closed.
- Opening the app and new connections is a little quicker: the server remembers a successful sign-in check for a few seconds instead of asking again for every file.

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
