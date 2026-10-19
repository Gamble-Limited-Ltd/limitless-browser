# Limitless Browser: design spec (from Boss's picks, 2026-10-18)

Source of truth for the visual work in stages 3 to 6. Values are copied from the design picker artifact
(https://claude.ai/artifact/UaudLygUksTJaxxSccEXue, `THEMES` / `GLLT` / `mark()` in its script). Picks and
what ships: `PLAN.md` section 2b. Every theme is data (one token file), never new components.

## 1. Theme tokens
Attribute contract: `<html data-lb-theme="<id>" data-lb-mode="light|dark">`. The user setting is
`light | dark | auto`; `auto` follows `prefers-color-scheme` and the resolved mode is written to `data-lb-mode`.
Themes without a mode (Vault has dark only) fall back to the mode they have.

Token names (all themes): `--lb-bg` page, `--lb-surf` raised surface, `--lb-fg` text, `--lb-mut` muted text,
`--lb-line` rules and borders, `--lb-acc` accent, `--lb-acc2` second accent, `--lb-acc3` third accent (equals
acc2 when not listed), `--lb-on` text on accent, `--lb-r` corner radius, `--lb-fd` display font, `--lb-fb` body
font, `--lb-fm` mono font (GLL themes: DM Mono; others fall back to `ui-monospace`).

| id | Name | Mode | bg | surf | fg | mut | line | acc | acc2 | on | acc3 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| luxury | Luxury (default) | dark | #070a10 | #0e131c | #eae6dc | #8d93a0 | #232a38 | #BDFFFF | #4DA6FF | #07101a | |
| luxury | | light | #eeece6 | #f8f6f1 | #11161f | #666b75 | #cfcbc0 | #1a5fae | #4DA6FF | #ffffff | |
| fancy | Fancy | dark | #0e1230 | #171c44 | #eef2ff | #9aa6d6 | #2c3470 | #4DA6FF | #BDFFFF | #05112a | #b69cff |
| fancy | | light | #f3f6ff | #ffffff | #1a1f4a | #5d6699 | #d6dcf5 | #2171dc | #BDFFFF | #ffffff | #8a63ee |
| minimal | Minimal | dark | #0c0d0f | #141517 | #f4f4f5 | #8a8d93 | #232528 | #4DA6FF | #BDFFFF | #04101c | |
| minimal | | light | #fcfcfd | #f3f4f6 | #101114 | #6b6f76 | #e4e6ea | #1e74d9 | #BDFFFF | #ffffff | |
| soft | Soft | dark | #1a2238 | #232d49 | #eaf1ff | #9fb0d0 | #34405f | #8cc4ff | #BDFFFF | #10213c | #f4b8d8 |
| soft | | light | #f2f7ff | #ffffff | #2b3a55 | #61718b | #dfe8f7 | #4DA6FF | #BDFFFF | #12304f | #ffc9e1 |
| retro | Retro | dark | #0b1a2a | #10263c | #BDFFFF | #6fa4c2 | #4DA6FF | #4DA6FF | #BDFFFF | #04121f | #ffcc66 |
| retro | | light | #e9eef2 | #f8fbfd | #1d2433 | #58627a | #1d2433 | #2171dc | #BDFFFF | #ffffff | #ff8a5c |
| ledger | Gilded Ledger | dark | #0b0912 | #131020 | #f0e8d0 | #aaa18a | #3b3322 | #c9a84c | #e2c87a | #0b0912 | #1b1729 |
| ledger | | light | #f0e8d0 | #f7f2e2 | #1b1626 | #5c5545 | #d3c79f | #7e6318 | #6b520f | #f0e8d0 | #e6dcbd |
| mono | GLL Monochrome | dark | #0d0d0d | #171717 | #f2f2f2 | #9a9a9a | #2e2e2e | #f2f2f2 | #bdbdbd | #0d0d0d | #1f1f1f |
| mono | | light | #f4f4f2 | #ffffff | #141414 | #6a6a6a | #d8d8d8 | #141414 | #555555 | #ffffff | #ededeb |
| vault | Vault | dark only | #000000 | #0b0912 | #ffffff | #d7ceb4 | #c9a84c | #e2c87a | #c9a84c | #000000 | #0b0912 |

GLL theme values come from gll-shared tokens (`packages/tokens/core.css`, `ledger.css`); log the copy in `SHARDS.md`.

## 2. Type and shape per theme
| id | Display (`--lb-fd`) | Body (`--lb-fb`) | `--lb-r` | Character |
|---|---|---|---|---|
| luxury | Bodoni Moda 400/500/600 | Jost 300/400/500 | 0 | Wordmark uppercase, letter-spacing .42em; small labels uppercase .26em; one thin accent rule; search is an underline; active tab has a 2px accent top edge. No gold (gold is GLL's). |
| fancy | Fraunces (incl. italic) | Outfit 300 to 600 | 16px | Italic display, clock in an acc to acc3 gradient, pill search with a gradient border, soft radial glows of acc and acc3 in the page background. |
| minimal | Figtree 300 to 600 | Figtree | 8px | Almost no borders: toolbar, address bar and footer have no visible rules; search is an underline; light clock weight 300. |
| soft | Quicksand 400 to 700 | Nunito 400 to 700 | 20px | Pill search and address bar, pastel radial fields of acc2/acc3, tiles cycle acc / acc2 / acc3 tints, soft shadows. |
| retro | VT323 | IBM Plex Mono 400/500 | 0 | 2px lines, hard 4px offset shadows in `--lb-line`, uppercase labels; dark mode adds faint scanlines. |
| ledger, mono, vault | Playfair Display 400 to 700 | DM Sans 400 to 600 | 2px | Labels, tabs, footer and address bar in DM Mono uppercase .12em at small size; one short accent rule under the wordmark; tiles on acc3. Mono greys the GLL stamp (`filter: grayscale(1)`); Vault draws borders in full gilt. |

All fonts are SIL OFL and are self-hosted as woff2 under `fonts/` with `font-display: swap` (no Google Fonts calls).

## 3. Marks
Official logo: **Orbit** (favicon, app icon, README, About, invite page). In the app the mark follows the theme
colors and users can pick Orbit, Lens or Wordmark in settings; every theme defaults to Orbit until Boss says
otherwise. All marks are drawn in a 64 by 64 box, `fill="none" stroke-linecap="round" stroke-linejoin="round"`.
Colors: `c1 = --lb-acc`, `c2 = --lb-acc2` (on light Limitless themes the artifact used `#4DA6FF` for c2).

- Orbit: `<path d="M53.92 30.08A22 22 0 1 1 41.30 12.06" stroke="c1" stroke-width="6"/>` plus
  `<circle cx="50.02" cy="19.38" r="5.5" fill="c2" stroke="none"/>`.
- Lens: `<path d="M32 15.9A18 18 0 0 1 32 48.1A18 18 0 0 1 32 15.9Z" fill="c2" fill-opacity=".45" stroke="none"/>`
  `<circle cx="24" cy="32" r="18" stroke="c1" stroke-width="5"/><circle cx="40" cy="32" r="18" stroke="c1" stroke-width="5"/>`.
- Wordmark: `<rect x="20" y="8" width="11" height="46" rx="5.5" fill="c1" stroke="none"/><circle cx="45" cy="48" r="6.5" fill="c2" stroke="none"/>`,
  shown next to the text "Limitless Browser" in the theme's display font.

The GLL Portfolio Stamp sits in footers and auth screens (`/theme/brand/portfolio-stamp-product-{dark,light}.svg`,
copied from gll-shared v0.2.3, all rights reserved per `NOTICE`). It reads "A Gamble Limited Ltd. product" (Boss, 2026-10-19).

## 4. Screens
- **Splash** (app boot): mark, wordmark, "Connecting to relay", thin progress bar, styled by the active theme.
  References: Luxury dark (mark 60px, uppercase wordmark "Limitless", 120px accent rule, 1px bar 200px wide),
  Gilded Ledger dark (double hairline frame, DM Mono label, three dots, stamp at the bottom), Minimal light (mark
  only, 96px by 2px bar, small status line).
- **Auth screens** (served by the gate before the app): one centered card, 380px, on the theme background with the
  stamp at the bottom. States: sign-in (button "Sign in with GLL ID", divider "or sign in here", login name or email,
  password, "Sign in", note "Use GLL ID to sign in once across Gamble Limited Ltd. products."), redirecting
  (spinner, "Signing you in", "Redirecting to GLL ID at id.taps-holdings.org", Cancel), invite only
  ("Limitless Browser is invite only.", "Signed in as" chip with the email, "This account has not been given
  access.", Sign out / Switch account), session ended ("Your session has ended.", "Sign in again"), GATE down
  ("GLL ID is unavailable.", "We could not reach GLL ID. Try again in a moment.", Try again / Back). Theme before
  sign-in: the last theme saved on this device (`localStorage` key `limitless:theme:v1`), default Luxury dark.
- **Relay notice** (in app): tag "Relay notice", "Our relay is not reachable right now.", "You can use third-party
  relays, which are not run by Gamble Limited Ltd.", Enable / Not now. Enabling is remembered per device and can
  be undone in settings.
- **Settings, Appearance:** theme grid (main picker): one mini preview card per theme (bg swatch with acc, surf and
  line bars, name below, 2px accent outline on the selected one), a Light / Dark / Auto segmented control, and the
  mark picker (Orbit, Lens, Wordmark). Theme drawer: a compact quick switcher from the toolbar menu.
- **Privacy toggles** (layout A): rows of icon chip, bold title, muted one-line description, switch on the right,
  1px rules between rows.
- **Update notice:** banner under the toolbar by default (accent-tinted bar, dot, "Update available", "What's new"
  link, "Reload" button, dismiss); the compact form is a pill in the toolbar. Never reloads by itself.
- **Start page:** wordmark with mark, greeting with date, large clock, search field (placeholder "Search the web or
  type an address"), up to 6 shortcut tiles, footer "Private browsing proxy" on the left and the stamp on the right.
