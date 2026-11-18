# Changelog

What changed, in plain language. Newest first.

## 1.2.1

- The owner admin member menu is tabbed with quick actions, grant presets and a danger zone.
- Users and Invites rows use the same chips as the member list.

## 1.2.0

- Heavy sites stop freezing the tab: Steam no longer shows the "Page unresponsive" dialog, and Kahoot, Discord, YouTube and Spotify load far faster on a Chromebook.
- Pages use much less memory: styles and fonts are no longer copied into the page as huge text blocks, and only one font file per face is fetched.
- Ad and tracker blocking no longer drops a site's own files on the first page.
- The block list is now prepared in small steps, so the page stays responsive right after it loads.
- On devices with 4 GB of memory or less, the app keeps smaller caches so there is more room for the page.
- Pages that load code on demand (Steam's lazy chunks) now fetch it through Limitless instead of loading it from the site directly.
- Page files that matter first (styles, scripts, fonts) are no longer stuck behind a long line of images.
- A site that answers with an empty error page, or a bot check page, now shows a plain card instead of a blank tab.
- A script the page asks for again during one load is no longer downloaded again.
- Sites that open a sign-in window (for example "Sign in with Google" buttons on other sites) now get a working second window that can talk back to the page. Google's own login can still refuse an embedded browser.

## 1.1.0

- Everyone except the Director goes through the welcome again and picks a new number. Old certificates now show as replaced; a new one comes after the welcome. Your plan and usage stay.
- New look for every plan theme, with a new Crimson and platinum theme for Prime. Executive themes use a richer gold.
- Member cards are new: a foil card on the start page and the Membership page, and a card that turns over when a new plan is granted.
- Free plan: the fifth tab opens the Plans page, and the app keeps pages to about 3 Mbit/s.
- Plan limits changed: Cardinal 12 GB a week at up to 15 Mbit/s with 100 MB files; Prime 100 GB a month at up to 30 Mbit/s with 1 GB files; Executive 200 GB a month, then 3 Mbit/s, with 2 GB files.
- Certificates use the real Limitless fonts and come with a letter from the Director.
- Free plan: the start page shows a thin bar with your time left today, "Day finished" now appears on the start page itself (search is paused until midnight), and the 15 minute warning is a small note in the corner. Plan notices now take their look from your theme and show a day count.
- When a plan is ended by the Director, a notice shows what was paid and any refund the gate recorded.
- The "Human Check" card now appears only for real bot-check pages, not for login or error pages that mention a captcha.
- Requests through our relay now look like your own browser's (same browser name, language and header order), which clears some sites that blocked or challenged them.
- The Plans page has a new layout: three plans side by side, a comparison table, what each step adds, and the steps for asking. Your request shows how far it has got.
- The page shown when a site cannot be reached now says which part failed (you, the relay or the site) and names the site and the wait.
- The welcome page now takes the colour of your plan, and the last step shows your card or certificate.

## 1.0.2

- Settings > Connection: our relay no longer shows as unreachable in the relay list when it is working.

## 1.0.1

- Everyone goes through the welcome ceremony and chooses their own member number, including members who used Limitless before 1.0.
- Themes: after an update, the new themes now change colors on the first load (the browser kept last version's theme file until a reload).

## 1.0.0

- Membership: every GLL ID account can now sign in and gets the free Ordinal plan, which browses through public relays as before. Our own relay comes with the paid plans.
- Your plan can limit video quality (480p Ordinal, 720p Cardinal, 1080p Prime, no limit Executive). On YouTube the player is held to that size, and on other sites the largest version at or below it is picked. A short note says so once per session.
- Only one video plays at a time: when you leave a tab its video and audio pause, and muted autoplay videos that are not on screen wait until you scroll to them. A video you started yourself keeps playing while you scroll.
- When you have used 90 % of this week's or month's allowance, Data saver turns on by itself, once per period, with a calm note. If you turn it off, it stays off until the next period.
- The menu shows how much of your allowance (and your download allowance) you have used, as a small bar. Ordinal has none.
- Membership page: "Where your data went" lists the sites that used the most data this week. The list stays on this device and is never sent to us. A Clear button empties it.
- Executive members get a Load Now button on the Plans page: for a minute your page loads go first on our relay. Signed-in members also send a small, anonymous page load time sample (about 1 in 5 loads, never the site, never with Data saver) so we can see how fast pages are
- New Plans page (About, Plans): the three plans with typical limits, your own plan and usage, your receipts, a 24 hour trial button and a short form to ask for a plan. Nothing is charged in the app and no card details are ever asked for. A note appears 14 and 3 days before a plan ends, and the first time your allowance sends you to public relays. Paid plans are not open yet: until they are, the page says so and the trial and request buttons stay off.
- New Downloads panel in the menu: a queue with progress, pause and resume, retry and cancel. Files over your plan's size limit, or over 2 GB, are refused before they start.
- The welcome ceremony is the designed one: invitation, choosing your number, signing the Charter, the number reveal, your member card or certificate, and a short tour.
- Five new themes for paid plans: Ink blue and Silver (Cardinal), Garnet (Prime), Gilt and Onyx (Executive). Vault now belongs to the paid plans too.
- A theme your plan does not include shows a small seal and a short note. If a plan ends, Limitless moves you back to the last free theme you used.
- The toolbar is quieter: Back, Forward, Reload, the address bar (with the bookmark star and the ad blocker shield inside it), Extensions and one Limitless menu. New tab, History, Theme, Fullscreen, Membership, Report a problem, Settings and Developer mode are in the menu.
- Developer mode (in the menu) shows the logs, inspector and metrics buttons. It is off by default.
- Report a problem is now in the menu.
- The address bar shows the whole address with the site's main domain in strong type and the rest quieter. Click it to see and edit the plain address.
- Settings now has six groups: General, Appearance, Privacy and data, Connection, Membership and About. Settings opens on General. Nothing was removed, controls only moved.
- The Membership page shows your name first, then your number, your plan, its limits and your certificate. When your plan is about to end, a note appears 14 days and 3 days before.
- The splash greets you by name, with your number small beneath it. The start page has a member card, and notices from the Director appear as a small engraved bulletin that you can dismiss.
- When a page cannot load, you now get a calm card with one plain sentence, Try again, Report a problem and the technical details folded away. When a site asks for a human check, a plain card says so.
- Free plans show their limits: Ordinal members have 4 open tabs and about 4 hours a day. A note appears when about 15 minutes are left.
- The old interactive tour is gone. A short tour after the welcome replaces it.
- Tabs can sit on the left (Settings, Appearance, Tab layout). The rail folds to icons on a narrow window or with the button at its top.
- Pages use less data. Pictures are requested as AVIF or WebP where the site offers them. Pictures far below the screen are no longer fetched before you scroll to them. Hints that make a browser fetch pages you may never open (prefetch, prerender, and speculation rules) are ignored. Compressed responses were already on and stay on.
- The ad and tracker blocklist is bigger: HaGeZi Multi Normal replaces Light, so more trackers are blocked. It downloads once, after your first page, and is then kept on your device.
- Downloads of files over 20 MB are split into parallel parts, as many as your plan allows (Ordinal 1, Cardinal 2, Prime 4, Executive 8), when the site supports it. Pause, resume, retry and cancel work as before.
- Downloads use their own connection to our relay, count separately from browsing, and wait while a page is loading, so a download does not slow your browsing. If your monthly download allowance is used up, the Downloads panel says so.
- New in Settings, Connection: send downloads over 200 MB through public relays to save your allowance. It is off by default. Public relays are run by other people and can see which sites you connect to.

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
