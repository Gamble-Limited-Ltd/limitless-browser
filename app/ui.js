/* Limitless Browser 1.0 UI layer (slice S6, docs/1.0/UI.md). Loaded after app/main.js. Display only: every access decision is the
 * gate's and nginx's. It reads window.LB_member (the gate's /_lb/me answer) and drives the existing controls by id, so skins keep
 * upstream behaviour (the new chrome is hidden under a skin). All dynamic text goes through textContent. Fork of GUST (AGPLv3). */
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    var ICONS = 'theme/icons.svg';
    function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function icon(name, cls) {
        var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('class', 'lb-i' + (cls ? ' ' + cls : '')); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
        var u = document.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', ICONS + '#lb-i-' + name); s.appendChild(u); return s;
    }
    function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (_) {} return null; }
    var TIER_NAME = { ordinal: 'Ordinal', cardinal: 'Cardinal', prime: 'Prime', executive: 'Executive' };
    var STANDING = { good: 'Good standing', warned: 'Warned', suspended: 'Suspended', removed: 'Removed' };
    function member() { return window.LB_member || null; }
    function tierOf(m) { return m ? ((m.plan && m.plan.tier) || m.tier || 'ordinal') : null; }
    function pad(n) { return n == null ? '' : String(n).padStart(4, '0'); }
    // px (optional): at 20 px and below Executive uses the small mark (no compass points, WP1 symbol lb-mk-tier-executive-sm)
    function markSvg(tier, px) {
        var t = TIER_NAME[tier] ? tier : 'ordinal', s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 96 96'); s.setAttribute('class', 'lb-mk lb-tier-mark'); s.setAttribute('aria-hidden', 'true');
        var u = document.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', '#lb-mk-tier-' + t + (t === 'executive' && px && px <= 20 ? '-sm' : '')); s.appendChild(u); return s;
    }
    var RANK = { ordinal: 0, cardinal: 1, prime: 2, executive: 3 };
    function sinceShort(ms) { return new Date(ms).toLocaleDateString('en', { month: 'short', year: 'numeric' }); }
    /* The member card (kind 'card', 1.586:1 foil card) and the strip (kind 'strip', one row). Colours come from the tier hooks --tc/--tc2/--tcon (WP1).
     * o: { tag: 'button' for a clickable one, tier: show another tier's card }. Text only through textContent. */
    function memberCard(m, kind, o) {
        o = o || {}; var tier = o.tier || tierOf(m) || 'ordinal', strip = kind === 'strip';
        var r = el(o.tag || 'div', 'lb-mc lb-mc-' + (strip ? 'strip' : 'card') + ' lb-tier-' + tier); r.dataset.tier = tier; if (o.tag === 'button') r.type = 'button';
        var nm = el('div', 'lb-mc-nm'); nm.appendChild(el('span', 'lb-mc-n', m.name || 'Member')); nm.appendChild(el('small', 'lb-mc-t', TIER_NAME[tier]));
        var no = el('span', 'lb-mc-no', m.number != null ? 'No. ' + pad(m.number) : '');
        if (strip) { r.appendChild(markSvg(tier)); r.appendChild(nm); r.appendChild(no); return r; }
        var top = el('div', 'lb-mc-top'); top.appendChild(el('span', 'lb-mc-brand', 'Limitless')); top.appendChild(markSvg(tier)); r.appendChild(top); r.appendChild(nm);
        var ft = el('div', 'lb-mc-ft'); ft.appendChild(no); if (m.admittedAt) ft.appendChild(el('span', 'lb-mc-since', 'Since ' + sinceShort(m.admittedAt))); r.appendChild(ft);
        return r;
    }
    window.LBUI = { el: el, icon: icon, store: store, member: member, tierOf: tierOf, pad: pad, markSvg: markSvg, memberCard: memberCard, TIER_NAME: TIER_NAME, STANDING: STANDING };

    /* ---------- Developer mode (Settings > General, limitless:devmode:v1) ---------- */
    var DEV = 'limitless:devmode:v1';
    function devOn() { return store(DEV) === '1'; }
    function applyDev() {
        document.documentElement.toggleAttribute('data-lb-dev', devOn());
        var cb = document.querySelector('#lbMenu [data-dev]'); if (cb) cb.setAttribute('aria-checked', devOn() ? 'true' : 'false');
        var sw = $('lbDevSwitch'); if (sw) { sw.classList.toggle('on', devOn()); sw.setAttribute('aria-checked', devOn() ? 'true' : 'false'); }
    }
    function setDev(on) { store(DEV, on ? '1' : '0'); applyDev(); }
    window.LBUI.setDev = setDev;

    /* ---------- The Limitless menu ---------- */
    var menu, menuBtn;
    function proxy(id) { return function () { var b = $(id); if (b) b.click(); }; }
    function openSettings(section) {
        var b = $('settingsBtn'); if (b) b.click();
        setTimeout(function () { var n = document.querySelector('.settings-nav-item[data-section="' + section + '"]'); if (n) n.click(); }, 0);
    }
    window.LBUI.openSettings = openSettings;
    var ITEMS = [
        ['newtab', 'plus', 'New tab', 'Ctrl+T', proxy('newTab')],
        ['home', 'home', 'Start page', '', proxy('home')],
        ['history', 'history', 'History', 'Alt+H', proxy('historyBtn')],
        ['find', 'search', 'Find in page', 'Alt+F', proxy('findOmniBtn')],
        ['bookmarks', 'bookmarks', 'Show bookmarks bar', '', function () { var w = $('bookmarksWrap'); if (!w) return; var hidden = w.classList.contains('hidden'); var b = hidden ? $('showBookmarksBtn') : $('bookmarksToggle'); if (b) b.click(); }, 'check'],
        '-',
        ['theme', 'palette', 'Theme', '', proxy('lbThemeBtn')],
        ['fullscreen', 'fullscreen', 'Fullscreen', 'F11', proxy('fullscreenBtn')],
        '-',
        ['plans', 'card', 'Plans', '', function () { if (window.LB_go) window.LB_go('limitless://plans'); }],
        ['membership', 'card', 'Membership', '', function () { openSettings('membership'); }],
        ['report', 'flag', 'Report a problem', '', function () { if (window.LBReport) window.LBReport.open(); }],
        ['settings', 'gear', 'Settings', 'Alt+P', proxy('settingsBtn')],
        ['dev', 'code', 'Developer mode', '', function () { setDev(!devOn()); }, 'check']
    ];
    function paintHeader() {
        var h = menu.querySelector('.lb-mh'); if (!h) return;
        h.textContent = '';
        var m = member(), tier = tierOf(m) || 'ordinal';
        h.className = 'lb-mh lb-tier-' + tier; h.dataset.tier = tier;
        var pi = menu.querySelector('[data-id="plans"]'); if (pi) { if (m && m.plan && m.plan.plansOpen === true) pi.dataset.accent = '1'; else delete pi.dataset.accent; }
        h.appendChild(markSvg(tier));
        var t = el('div', 'lb-mh-t');
        t.appendChild(el('div', 'lb-mh-name', m && m.name ? m.name : 'Limitless Browser'));
        if (m && m.number != null) {
            var bits = ['No. ' + pad(m.number), TIER_NAME[tierOf(m)], STANDING[m.standing] || ''];
            t.appendChild(el('div', 'lb-mh-sub', bits.filter(Boolean).join(' · ')));
        }
        h.appendChild(t);
    }
    function items() { return Array.prototype.slice.call(menu.querySelectorAll('[role^="menuitem"]')); }
    function closeMenu(refocus) {
        if (menu.hidden) return;
        menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); if (refocus) menuBtn.focus();
    }
    function openMenu() {
        paintHeader(); paintMeter(); applyDev();
        var bm = menu.querySelector('[data-id="bookmarks"]'); var w = $('bookmarksWrap'); if (bm) bm.setAttribute('aria-checked', w && !w.classList.contains('hidden') ? 'true' : 'false');
        menu.hidden = false; menuBtn.setAttribute('aria-expanded', 'true');
        var f = items()[0]; if (f) f.focus();
    }
    function buildMenu() {
        var nav = document.querySelector('.navbar'); if (!nav || $('lbMenuBtn')) return;
        menuBtn = el('button', 'tool-btn'); menuBtn.id = 'lbMenuBtn'; menuBtn.type = 'button';
        menuBtn.setAttribute('aria-haspopup', 'menu'); menuBtn.setAttribute('aria-expanded', 'false'); menuBtn.setAttribute('aria-label', 'Limitless menu'); menuBtn.title = 'Limitless menu';
        menuBtn.appendChild(icon('menu'));
        nav.appendChild(menuBtn);
        menu = el('div', 'lb-menu'); menu.id = 'lbMenu'; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'Limitless menu'); menu.hidden = true;
        menu.appendChild(el('div', 'lb-mh'));
        var mm = el('div', 'lb-mm'); mm.setAttribute('role', 'group'); mm.setAttribute('aria-label', 'Data used'); mm.hidden = true; menu.appendChild(mm);
        ITEMS.forEach(function (it) {
            if (it === '-') { var hr = el('div', 'lb-msep'); hr.setAttribute('role', 'separator'); menu.appendChild(hr); return; }
            var b = el('button', 'lb-mi'); b.type = 'button'; b.dataset.id = it[0]; b.setAttribute('role', it[5] ? 'menuitemcheckbox' : 'menuitem'); b.tabIndex = -1;
            if (it[0] === 'dev') b.dataset.dev = '1';
            if (it[5]) b.setAttribute('aria-checked', 'false');
            b.appendChild(icon(it[1])); b.appendChild(el('span', 'lb-mi-l', it[2])); if (it[3]) b.appendChild(el('kbd', 'lb-mi-k', it[3]));
            if (it[5]) { var tick = icon('check', 'lb-mi-tick'); b.appendChild(tick); }
            b.addEventListener('click', function () { closeMenu(false); it[4](); });
            menu.appendChild(b);
        });
        document.body.appendChild(menu);
        menuBtn.addEventListener('click', function (e) { e.stopPropagation(); if (menu.hidden) openMenu(); else closeMenu(true); });
        menu.addEventListener('keydown', function (e) {
            var list = items(), i = list.indexOf(document.activeElement);
            if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length].focus(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
            else if (e.key === 'Home') { e.preventDefault(); list[0].focus(); }
            else if (e.key === 'End') { e.preventDefault(); list[list.length - 1].focus(); }
            else if (e.key === 'Tab') { closeMenu(false); }
        });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) { e.stopPropagation(); closeMenu(true); } }, true);
        document.addEventListener('mousedown', function (e) { if (!menu.hidden && !menu.contains(e.target) && !menuBtn.contains(e.target)) closeMenu(false); }, true);
        document.addEventListener('lb-member', function () { if (!menu.hidden) { paintHeader(); paintMeter(); } });
        window.LBUI.openMenu = openMenu; window.LBUI.closeMenu = closeMenu;
    }

    /* The ad-block shield sits inside the address bar's right end (UI.md 2). Under an upstream skin it goes back to the toolbar. */
    function placeShield() {
        var bt = $('blockToggle'), act = document.querySelector('.omnibox-actions'), nav = document.querySelector('.navbar');
        if (!bt || !act || !nav) return;
        var skin = document.documentElement.hasAttribute('data-skin');
        if (!skin && bt.parentNode !== act) { bt.setAttribute('aria-label', 'Ad and tracker blocking'); act.insertBefore(bt, $('bookmarkBtn') || act.firstChild); }
        else if (skin && bt.parentNode === act) nav.appendChild(bt);
    }

    /* ---------- Report a problem (ADMIN.md 8). POST /_lb/report; category ids are the gate's REPORT_CATEGORIES (limitless-gate src/panel.ts). ---------- */
    var CATS = [['slow', 'Slow'], ['broken', 'Broken site'], ['looks', 'Looks wrong'], ['account', 'Account'], ['bot', 'Bot check'], ['other', 'Other']];
    window.LBReport = {
        open: function (cat, host) {
            var old = $('lbReportDlg'); if (old) old.remove();
            var d = el('div', 'lb-dlg'); d.id = 'lbReportDlg'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-labelledby', 'lbRepT');
            var card = el('div', 'lb-dlg-card');
            var h = el('h2', 'lb-dlg-t', 'Report a problem'); h.id = 'lbRepT';
            var sel = el('select', 'lb-dlg-in'); sel.id = 'lbRepCat'; sel.setAttribute('aria-label', 'Category');
            CATS.forEach(function (c) { var o = el('option', null, c[1]); o.value = c[0]; if (c[0] === cat || c[1] === cat) o.selected = true; sel.appendChild(o); });
            var note = el('textarea', 'lb-dlg-in'); note.id = 'lbRepNote'; note.maxLength = 500; note.rows = 4; note.placeholder = 'What happened? (500 characters)'; note.setAttribute('aria-label', 'What happened');
            var lab = el('label', 'lb-dlg-tick'); var tick = el('input'); tick.type = 'checkbox'; tick.id = 'lbRepHost'; lab.append(tick, el('span', null, "Include the site's address (domain only)"));
            var msg = el('div', 'lb-note'); msg.id = 'lbRepMsg'; msg.setAttribute('role', 'status');
            var row = el('div', 'lb-dlg-row'); var cancel = el('button', 'lb-btn', 'Cancel'); cancel.type = 'button'; var send = el('button', 'lb-btn lb-btn-p', 'Send'); send.type = 'button'; send.id = 'lbRepSend';
            row.append(cancel, send); card.append(h, sel, note, lab, msg, row); d.appendChild(card); document.body.appendChild(d);
            function close() { d.remove(); document.removeEventListener('keydown', esc, true); if (menuBtn) menuBtn.focus(); }
            function esc(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
            cancel.onclick = close; document.addEventListener('keydown', esc, true);
            send.onclick = function () {
                var text = note.value.trim().slice(0, 500);
                if (!text) { msg.textContent = 'Write a few words about what happened first.'; note.focus(); return; }
                send.disabled = true; msg.textContent = 'Sending';
                var body = { category: sel.value, note: text };
                if (tick.checked && host) { body.includeSite = true; body.site = 'https://' + host + '/'; }
                fetch('/_lb/report', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
                    .then(function (r) { if (!r.ok) throw new Error('x'); msg.textContent = 'Thank you. Your report was sent.'; send.hidden = true; cancel.textContent = 'Close'; })
                    .catch(function () { msg.textContent = 'Reports are not available right now. Please try again later.'; send.disabled = false; });
            };
            sel.focus();
        }
    };

    /* ---------- Address bar: the domain picked out (UI.md 3.2). Focus selects all and shows the raw URL. ---------- */
    var TWO = /^(co|com|org|net|gov|edu|ac)\.[a-z]{2}$/;
    function splitUrl(v) {
        var u; try { u = new URL(v); } catch (_) { return null; }
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
        var labels = u.hostname.split('.'), keep = labels.length > 2 && TWO.test(labels.slice(-2).join('.')) ? 3 : 2;
        var dom = /^[\d.]+$|:/.test(u.hostname) || labels.length <= keep ? u.hostname : labels.slice(-keep).join('.');
        var sub = u.hostname.slice(0, u.hostname.length - dom.length);
        var rest = v.slice(v.indexOf(u.hostname) + u.hostname.length);
        return [v.slice(0, v.indexOf(u.hostname)) + sub, dom, rest];
    }
    window.LBUI.splitUrl = splitUrl;
    function buildUrlView() {
        var inp = $('url'), box = inp && inp.closest('.omnibox'); if (!inp || !box || $('lbUrlView')) return;
        var view = el('div', 'lb-urlview'); view.id = 'lbUrlView'; view.setAttribute('aria-hidden', 'true');
        var a = el('span', 'lb-uv-m'), b = el('span', 'lb-uv-d'), c = el('span', 'lb-uv-m lb-uv-p');
        view.append(a, b, c); box.appendChild(view);
        function paint() {
            var parts = !document.documentElement.hasAttribute('data-skin') && document.activeElement !== inp ? splitUrl(inp.value) : null;
            box.classList.toggle('lb-uv-on', !!parts);
            if (!parts) return;
            a.textContent = parts[0]; b.textContent = parts[1]; c.textContent = parts[2];
            var br = inp.getBoundingClientRect(), xr = box.getBoundingClientRect();
            view.style.left = (br.left - xr.left) + 'px'; view.style.width = br.width + 'px';
        }
        // The app sets url.value from code in many places; a setter hook repaints without touching those callers.
        var d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        Object.defineProperty(inp, 'value', { configurable: true, get: function () { return d.get.call(inp); }, set: function (v) { d.set.call(inp, v); paint(); } });
        inp.addEventListener('focus', function () { paint(); setTimeout(function () { inp.select(); }, 0); });
        inp.addEventListener('blur', paint); inp.addEventListener('input', paint);
        window.addEventListener('resize', paint);
        new MutationObserver(paint).observe(document.documentElement, { attributes: true, attributeFilter: ['data-skin'] });
        paint();
    }

    /* ---------- Tab layout: top (classic, default) or side rail (UI.md 3.1), limitless:tablayout:v1 ---------- */
    var TL = 'limitless:tablayout:v1';
    function tabLayout() { return store(TL) === 'side' ? 'side' : 'top'; }
    function applyTabs() {
        var side = tabLayout() === 'side', h = document.documentElement;
        h.setAttribute('data-lb-tabs', tabLayout());
        h.toggleAttribute('data-lb-rail-min', side && (window.innerWidth < 1200 || store('limitless:tabrail:v1') === 'min'));
        document.querySelectorAll('#lbTabLayoutSeg button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.v === tabLayout() ? 'true' : 'false'); });
        var t = $('lbRailToggle'); if (t) t.hidden = !side;
    }
    window.LBUI.setTabLayout = function (v) { store(TL, v === 'side' ? 'side' : 'top'); applyTabs(); };
    function buildTabs() {
        var tb = document.querySelector('.titlebar'); if (!tb || $('lbRailToggle')) return;
        var t = el('button', 'tool-btn'); t.id = 'lbRailToggle'; t.type = 'button'; t.hidden = true; t.setAttribute('aria-label', 'Collapse or expand the tab rail'); t.title = 'Collapse or expand tabs';
        t.appendChild(icon('sidebar')); t.addEventListener('click', function () { var min = document.documentElement.hasAttribute('data-lb-rail-min'); store('limitless:tabrail:v1', min ? 'full' : 'min'); document.documentElement.toggleAttribute('data-lb-rail-min', !min); });
        tb.insertBefore(t, tb.firstChild);
        document.querySelectorAll('#lbTabLayoutSeg button').forEach(function (b) { b.addEventListener('click', function () { window.LBUI.setTabLayout(b.dataset.v); }); });
        window.addEventListener('resize', applyTabs);
        applyTabs();
    }
    /* The member strip pinned at the foot of the vertical rail (1.1 WP2); CSS shows it only with data-lb-tabs=side, the mark alone when the rail is collapsed */
    function paintRailMe() {
        var tb = document.querySelector('.titlebar'); if (!tb) return;
        var old = tb.querySelector('.lb-rail-me'), m = member(); if (old) old.remove();
        if (!m) return;
        var c = memberCard(m, 'strip', { tag: 'button' }); c.classList.add('lb-rail-me'); c.setAttribute('aria-label', 'Membership: ' + (m.name || '') + ', number ' + pad(m.number));
        c.addEventListener('click', function () { openSettings('membership'); }); tb.appendChild(c);
    }

    /* ---------- The card turns over (1.1 WP2, DESIGN-GAPS 12): the first open after a plan is granted ---------- */
    var LT = 'limitless:lasttier:v1', LG = 'limitless:lastgrant:v1';
    function closeGranted() { var d = $('lbGranted'); if (d) d.remove(); }
    function showGranted(m, oldTier) {
        closeGranted();
        var tier = tierOf(m), d = el('div', 'lb-dlg lb-gr'); d.id = 'lbGranted'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-labelledby', 'lbGrT'); d.dataset.tier = tier;
        var card = el('div', 'lb-dlg-card lb-gr-card lb-tier-' + tier), stack = el('div', 'lb-gr-stack');
        var o = memberCard(m, 'card', { tier: oldTier }); o.classList.add('lb-gr-old'); var n = memberCard(m, 'card'); n.classList.add('lb-gr-new');
        var sw = el('div', 'lb-gr-sweep'), sp = el('div', 'lb-gr-sparks'); sp.setAttribute('aria-hidden', 'true');
        for (var i = 0; i < 12; i++) { var a = Math.PI * 2 * i / 12 + .3, r = 90 + (i % 3) * 28, k = el('i'); k.style.setProperty('--dx', Math.round(Math.cos(a) * r * 1.4) + 'px'); k.style.setProperty('--dy', Math.round(Math.sin(a) * r) + 'px'); k.style.animationDelay = (.8 + (i % 4) * .05) + 's'; sp.appendChild(k); }
        stack.append(o, n, sw, sp); card.appendChild(stack);
        var msg = el('div', 'lb-gr-msg'), h = el('h2', 'lb-gr-t'); h.id = 'lbGrT'; h.appendChild(document.createTextNode('You are now ')); h.appendChild(el('em', null, TIER_NAME[tier])); msg.appendChild(h);
        var p = m.plan || {};
        msg.appendChild(el('p', 'lb-note', (p.paidUntil ? 'From today until ' + fmtDate(p.paidUntil) + '. ' : 'From today. ') + 'Your new theme and certificate are ready in Membership.'));
        card.appendChild(msg);
        var row = el('div', 'lb-dlg-row'), go = el('button', 'lb-btn lb-btn-p', 'See what is new'), later = el('button', 'lb-btn', 'Later'); go.type = later.type = 'button';
        go.addEventListener('click', function () { closeGranted(); openSettings('membership'); }); later.addEventListener('click', closeGranted);
        row.append(go, later); card.appendChild(row); d.appendChild(card); document.body.appendChild(d); go.focus();
        d.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeGranted(); });
    }
    // Shown when the tier rises (limitless:lasttier:v1) or the gate's plan.grantedAt moves (limitless:lastgrant:v1, also a renewal). First load ever, a drop and the same state stay silent.
    function grantCheck(m) {
        var p = m && m.plan; if (!p) return;
        var tier = tierOf(m), lt = store(LT), lg = store(LG), gr = p.grantedAt != null ? Number(p.grantedAt) : null, known = RANK[lt] != null;
        var rise = known && RANK[tier] > RANK[lt], regrant = gr != null && lg != null && gr > Number(lg) && tier !== 'ordinal';
        store(LT, tier); if (gr != null) store(LG, String(gr));
        if (rise || regrant) showGranted(m, known ? lt : 'ordinal');
    }

    /* ---------- Settings in six groups (UI.md 5): each group shows its old sections together; keys and handlers are untouched ---------- */
    var GROUPS = [
        ['search', 'General', ['search', 'homescreen', 'shortcuts', 'language']],
        ['appearance', 'Appearance', ['appearance', 'skins']],
        ['privacy', 'Privacy and data', ['privacy', 'cache', 'filesandmedia']],
        ['connection', 'Connection', ['connection', 'fallback']],
        ['membership', 'Membership', ['membership']],
        ['about', 'About', ['about']]
    ];
    function groupOf(sec) { for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i][2].indexOf(sec) >= 0) return GROUPS[i]; return null; }
    window.LBUI.groupTitle = function (sec) { var g = groupOf(sec); return g ? g[1] : null; };
    var settleGuard = false;
    function settle() {
        if (settleGuard) return;
        var secs = document.querySelectorAll('.settings-section[data-lb-group]');
        var shown = null; secs.forEach(function (e) { if (!shown && e.style.display !== 'none' && e.style.display !== '') shown = e; });
        if (!shown) return;
        var g = groupOf(shown.dataset.section); if (!g) return;
        settleGuard = true;
        g[2].forEach(function (id) { var e = document.querySelector('.settings-section[data-section="' + id + '"]'); if (e) e.style.display = 'flex'; });
        document.querySelectorAll('.settings-nav-item').forEach(function (b) { b.classList.toggle('active', b.dataset.section === g[0]); });
        settleGuard = false;
        if (g[0] === 'membership') paintMembership();
    }
    function buildSettings() {
        var page = $('settingsPage'); if (!page) return;
        GROUPS.forEach(function (g) { g[2].forEach(function (id) { var e = document.querySelector('.settings-section[data-section="' + id + '"]'); if (e) e.dataset.lbGroup = g[0]; }); });
        var mo = new MutationObserver(settle);
        document.querySelectorAll('.settings-section').forEach(function (e) { mo.observe(e, { attributes: true, attributeFilter: ['style'] }); });
        // Developer mode card (General)
        var gen = document.querySelector('.settings-section[data-section="search"]');
        if (gen && !$('lbDevCard')) {
            var card = el('div', 'settings-card'); card.id = 'lbDevCard';
            var head = el('div', 'settings-card-head'); head.appendChild(icon('code')); head.appendChild(document.createTextNode(' Developer mode'));
            var body = el('div', 'settings-card-body'); var row = el('div', 'lb-row-set');
            var t = el('div'); t.appendChild(el('div', 'settings-switch-label', 'Show developer tools')); t.appendChild(el('div', 'lb-note', 'Adds the logs, page inspector and metrics buttons to the toolbar. The keyboard shortcuts work either way.'));
            var sw = el('button', 'lb-switch'); sw.id = 'lbDevSwitch'; sw.type = 'button'; sw.setAttribute('role', 'switch'); sw.setAttribute('aria-label', 'Developer mode');
            sw.addEventListener('click', function () { setDev(!devOn()); });
            row.append(t, sw); body.appendChild(row); card.append(head, body); gen.appendChild(card); applyDev();
        }
    }

    /* ---------- Membership page, plan limits and expiry notices (UI.md 6.4, PAID-TIERS-PLAN) ---------- */
    function fmtDate(ms) { return new Date(ms).toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' }); }
    function fmtMonth(ms) { return new Date(ms).toLocaleDateString('en', { month: 'long', year: 'numeric' }); }
    function gib(b) { return (b / 1073741824).toFixed(b >= 10737418240 ? 0 : 1) + ' GiB'; }
    function limitLines(m) {
        var l = (m && m.plan && m.plan.limits) || {}, out = [];
        if (l.tabs) out.push(['Open tabs', String(l.tabs)]);
        if (l.dailyMinutes) out.push(['Daily time', l.dailyMinutes >= 60 ? (l.dailyMinutes / 60) + ' hours' : l.dailyMinutes + ' minutes']);
        if (l.weeklyGb) out.push(['Data per week', l.weeklyGb + ' GB']);
        if (l.monthlyGb) out.push(['Data per month', l.monthlyGb + ' GB']);
        if (l.speedMbps) out.push(['Speed', l.speedMbps + ' Mbit/s']);
        if (l.downloadMbPerFile != null && l.downloadsPerDay != null) out.push(['Downloads', 'up to ' + (l.downloadMbPerFile >= 1024 ? l.downloadMbPerFile / 1024 + ' GB' : l.downloadMbPerFile + ' MB') + ' each, ' + (l.downloadsPerDay > 0 ? l.downloadsPerDay + ' a day' : 'any number a day')]);
        if (l.videoMaxP != null) out.push(['Video', l.videoMaxP > 0 ? 'up to ' + l.videoMaxP + 'p' : 'No limit']);
        if (l.loadNowPerDay) out.push(['Load Now', l.loadNowPerDay + ' a day']);
        return out;
    }
    /* Expiry notice: 14 days and 3 days before paidUntil (in app only). Executive and Ordinal have no end date. */
    function expiry(m, now) {
        var p = m && m.plan; if (!p || !p.paidUntil || p.tier === 'ordinal') return null;
        var days = Math.ceil((p.paidUntil - (now || Date.now())) / 864e5);
        if (days > 14 || days < 1) return null;
        return { days: days, level: days <= 3 ? 'soon' : 'near', text: days <= 3 ? 'Your ' + TIER_NAME[p.tier] + ' plan ends in ' + days + (days === 1 ? ' day' : ' days') + ', on ' + fmtDate(p.paidUntil) + '.' : 'Your ' + TIER_NAME[p.tier] + ' plan ends on ' + fmtDate(p.paidUntil) + '.' };
    }
    window.LBUI.expiry = expiry;
    function plansLine(m) {
        var open = m && m.plan && m.plan.plansOpen === true, n = el('div', 'lb-pl');
        if (!open) { n.textContent = 'Paid plans are coming soon.'; n.dataset.state = 'soon'; return n; }
        n.dataset.state = 'open'; n.appendChild(document.createTextNode('Paid plans are open. '));
        var a = el('a', null, 'See the plans'); a.href = 'limitless://plans'; a.addEventListener('click', function (e) { e.preventDefault(); if (window.LB_go) window.LB_go('limitless://plans'); }); n.appendChild(a); return n;
    }
    window.LBUI.plansLine = plansLine;
    /* Membership panel (1.1 WP2, DESIGN-GAPS 4): the card first, a summary row (only cells that have data), plain rows, the limits folded. */
    function sumCell(label, value, frac) {
        var c = el('div', 'lb-sum-c'); c.appendChild(el('div', 'lb-sum-l', label)); c.appendChild(el('div', 'lb-sum-v', value));
        if (frac != null) { var b = el('div', 'lb-bar'); b.setAttribute('role', 'progressbar'); b.setAttribute('aria-label', label); b.setAttribute('aria-valuemin', '0'); b.setAttribute('aria-valuemax', '100'); b.setAttribute('aria-valuenow', String(Math.round(Math.max(0, Math.min(1, frac)) * 100))); var f = el('i'); f.style.width = Math.max(0, Math.min(1, frac)) * 100 + '%'; b.appendChild(f); c.appendChild(b); }
        return c;
    }
    function summaryRow(m, tier) {
        var p = m.plan || {}, l = p.limits || {}, c = p.cap, cells = [];
        if (tier === 'executive' && p.loadNowLeft != null) cells.push(sumCell('Load Now', p.loadNowLeft + ' left today', l.loadNowPerDay ? p.loadNowLeft / l.loadNowPerDay : null));
        else if (c && c.capGb > 0) cells.push(sumCell(l.monthlyGb && !l.weeklyGb ? 'This month' : 'This week', num(c.usedGb || 0) + ' of ' + num(c.capGb) + ' GB', (c.usedGb || 0) / c.capGb));
        if (p.topupGbLeft > 0) cells.push(sumCell('Extra data', num(p.topupGbLeft) + ' GB left', l.topupGb ? p.topupGbLeft / l.topupGb : null));
        if (p.paidUntil && tier !== 'ordinal') { var d = Math.ceil((p.paidUntil - Date.now()) / 864e5); if (d > 0) cells.push(sumCell('Your plan', d + (d === 1 ? ' day left' : ' days left'), Math.min(1, d / 365))); }
        if (!cells.length) return null;
        var row = el('div', 'lb-sum'); cells.forEach(function (c2) { row.appendChild(c2); }); return row;
    }
    function mpRow(label, parts) {
        var r = el('div', 'lb-row'), v = el('div', 'lb-row-v'); r.appendChild(el('div', 'lb-row-l', label));
        parts.forEach(function (x) { if (x) v.appendChild(x); }); r.appendChild(v); return r;
    }
    function paintMembership() {
        var root = $('lbMemberPage'); if (!root) return;
        var m = member(); root.textContent = '';
        if (!m) { var card = el('div', 'settings-card'), body = el('div', 'settings-card-body'); body.appendChild(el('div', 'settings-hint', 'Membership details appear here once you are signed in with a member account.')); card.appendChild(body); root.appendChild(card); return; }
        var tier = tierOf(m), p = m.plan || {};
        var wrap = el('div', 'lb-mp-card'); wrap.appendChild(memberCard(m, 'card')); root.appendChild(wrap);
        var sum = summaryRow(m, tier); if (sum) root.appendChild(sum);
        var rows = el('div', 'lb-rows'); root.appendChild(rows);
        var ex = expiry(m);
        if (p.paidUntil && tier !== 'ordinal') rows.appendChild(mpRow('Paid until', [el('span', null, fmtDate(p.paidUntil)), ex ? el('div', 'lb-note lb-warn', ex.text) : null]));
        if (p.plansOpen === true && p.trialAvailable) {
            var next = tier === 'ordinal' ? 'cardinal' : 'prime', tb = el('button', 'lb-btn', 'Start trial'), msg = el('span', 'lb-note'); tb.type = 'button'; msg.setAttribute('role', 'status');
            tb.addEventListener('click', function () {
                tb.disabled = true;
                fetch('/_lb/trial', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' }).then(function (r) { if (r.status === 200) { if (window.LB_meRefresh) window.LB_meRefresh(); } else { tb.disabled = false; msg.textContent = 'The trial could not start right now.'; } }, function () { tb.disabled = false; msg.textContent = 'The trial could not start right now.'; });
            });
            rows.appendChild(mpRow('Try ' + TIER_NAME[next] + ' for 24 hours', [tb, msg]));
        }
        var cert = [];
        if (m.certificateCode) {
            cert.push(el('div', 'lb-note', 'Certificate code ' + m.certificateCode));
            ['screen', 'print'].forEach(function (v) { var a = el('a', 'lb-btn', v === 'screen' ? 'Download PDF (screen)' : 'Download PDF (print)'); a.href = '/_lb/me/certificate.pdf?variant=' + v; a.download = ''; a.style.marginRight = '8px'; cert.push(a); });
        } else cert.push(el('div', 'lb-note', 'Certificates begin at the Cardinal plan. Your member card is on the start page.'));
        rows.appendChild(mpRow('Certificate', cert));
        var pill = el('span', 'lb-pill'); pill.dataset.standing = m.standing || 'good'; pill.appendChild(el('i', 'lb-dot'));
        pill.appendChild(document.createTextNode((STANDING[m.standing] || STANDING.good) + (m.standing === 'suspended' && m.standingUntil ? ' until ' + fmtDate(m.standingUntil) : '')));
        rows.appendChild(mpRow('Standing', [pill]));
        var ra = el('a', null, 'Read the Rules'); ra.href = '/legal/terms.html'; ra.target = '_blank'; ra.rel = 'noopener';
        var chv = el('span', null, (m.charterVersion || 'Not signed') + ' '); chv.appendChild(ra);
        rows.appendChild(mpRow('Charter', [chv]));
        // the limit lines stay as they were (plans slice), folded
        var inc = el('details', 'lb-incl'); inc.appendChild(el('summary', null, 'What your ' + TIER_NAME[tier] + ' plan includes'));
        var dl = el('dl', 'lb-dl'); limitLines(m).forEach(function (r) { dl.appendChild(el('dt', null, r[0])); dl.appendChild(el('dd', null, r[1])); });
        var u = p.used; if (u) { dl.appendChild(el('dt', null, 'Used today')); dl.appendChild(el('dd', null, gib(u.todayBytes || 0))); }
        inc.appendChild(dl); root.appendChild(inc);
        if (tier === 'ordinal' || tier === 'cardinal' || tier === 'prime') root.appendChild(plansLine(m));
        if (feat('siteReport')) root.appendChild(siteCard());
    }
    document.addEventListener('lb-member', function () { var g = document.querySelector('.settings-section[data-section="membership"]'); if (g && g.style.display === 'flex') paintMembership(); });

    /* ---------- Bot check (a plain card, never a way around it): TESTING 10 ---------- */
    // 1.1 (docs/1.1/BOTCHECK.md): only a real interstitial counts, never a bare substring. A 403/429/503 is a challenge when
    // the response headers say so (cf-mitigated: challenge), or a vendor marker sits in a SMALL page (Cloudflare "Just a moment" /
    // "Attention Required", Akamai, PerimeterX, DataDome, Imperva) or a captcha widget is nearly all the page has. A login or
    // error page that merely embeds reCAPTCHA is long and has real text, so it is not flagged. features.botCard=false restores the old test.
    window.LB_botCheck = function (status, html, hdrs) {
        if (status !== 403 && status !== 429 && status !== 503) return false;
        var t = String(html || '').slice(0, 60000);
        if (!feat('botCard')) return /cf-chl|cdn-cgi\/challenge-platform|Just a moment\.\.\.|g-recaptcha|h-captcha|hcaptcha\.com\/1\/api|Attention Required! \| Cloudflare/i.test(t);
        var h = {}; try { Object.keys(hdrs || {}).forEach(function (k) { h[k.toLowerCase()] = String(hdrs[k]).toLowerCase(); }); } catch (_) {}
        if (/challenge/.test(h['cf-mitigated'] || '')) return true;
        var m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(t), title = m ? m[1].replace(/\s+/g, ' ').trim() : '';
        var small = String(html || '').length < 40000;
        var cf = /cloudflare/.test(h.server || '') || 'cf-ray' in h;
        if (cf && small && (/^(Just a moment\.\.\.|Attention Required! \| Cloudflare|Checking your browser)/i.test(title) || /cdn-cgi\/challenge-platform\/h\/[a-z]\/orchestrate|cf-chl-|cf_chl_opt/i.test(t))) return true;
        if (small && (/datadome/.test(h.server || '') || 'x-datadome' in h || /captcha-delivery\.com|geo\.captcha-delivery/i.test(t))) return true;
        if (small && (/px-captcha|_pxCaptcha|Press &(amp;)? Hold|perimeterx\.net/i.test(t) || /Incapsula incident ID|_Incapsula_Resource/i.test(t))) return true;
        if (small && /^Access Denied$/i.test(title) && /errors\.edgesuite\.net|Reference #\d+\.[0-9a-f]+/i.test(t)) return true;
        // a captcha widget as the main content: short visible text around it
        if (small && /g-recaptcha|h-captcha|hcaptcha\.com\/1\/api|cf-turnstile|challenges\.cloudflare\.com\/turnstile/i.test(t)) {
            var txt = t.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            if (txt.length < 300 && /human|robot|verify|captcha|security check|not a bot|unusual traffic/i.test(txt + ' ' + title)) return true;
        }
        return false;
    };

    /* ---------- Splash: the member's name, the number small beneath (UI.md 4). Cached per device (limitless:me:v1: name and number only) ---------- */
    var ME_KEY = 'limitless:me:v1';
    // 1.1 WP2: the number and tier word are a mono footer line at the very bottom of the splash (the mark draws in by CSS)
    function paintSplash(name, number, tier) {
        var w = document.querySelector('.lb-sp-word'); if (!w) return;
        if (!name) return;
        w.textContent = name; w.classList.add('lb-sp-name');
        var sp = w.closest('.lb-splash'), f = document.querySelector('.lb-sp-foot');
        if (!f && sp) { f = el('div', 'lb-sp-foot'); sp.appendChild(f); }
        if (f) f.textContent = [number != null && number !== '' ? 'No. ' + pad(number) : '', TIER_NAME[tier] || ''].filter(Boolean).join(' · ');
    }
    function splashFromCache() { try { var c = JSON.parse(store(ME_KEY) || 'null'); if (c && c.name) paintSplash(String(c.name).slice(0, 80), c.number, c.tier); } catch (_) {} }

    /* ---------- Start page: member card, bulletin, expiry line, plans line (UI.md 4) ---------- */
    var DISMISSED = 'limitless:notices-dismissed:v1';
    function dismissed() { try { return JSON.parse(store(DISMISSED) || '[]'); } catch (_) { return []; } }
    function normNotices(list) {
        return (Array.isArray(list) ? list : []).map(function (n, i) {
            if (typeof n === 'string') return { id: 's' + i + ':' + n.slice(0, 20), text: n, date: null };
            return n && n.text ? { id: String(n.id != null ? n.id : n.text.slice(0, 20)), text: String(n.text), date: n.date || null } : null;
        }).filter(Boolean);
    }
    function paintStart() {
        var host = document.querySelector('.nt-content'), time = $('ntTime'); if (!host || !time) return;
        var box = $('lbStartMember');
        if (!box) { box = el('div', 'lb-startm'); box.id = 'lbStartMember'; time.parentNode.insertBefore(box, time.nextSibling); }
        box.textContent = '';
        var m = member(); if (!m) return;
        // bulletin(s)
        var gone = dismissed();
        normNotices(m.notices).filter(function (n) { return gone.indexOf(n.id) < 0; }).slice(0, 2).forEach(function (n) {
            var b = el('aside', 'lb-bulletin'); b.setAttribute('aria-label', 'Notice'); b.dataset.id = n.id;
            b.appendChild(el('div', 'lb-bul-l', 'Notice'));
            b.appendChild(el('p', 'lb-bul-t', n.text));
            var f = el('div', 'lb-bul-f'); if (n.date) f.appendChild(el('span', null, typeof n.date === 'number' ? fmtDate(n.date) : String(n.date)));
            var x = el('button', 'lb-bul-x', 'Dismiss'); x.type = 'button'; x.addEventListener('click', function () { var g = dismissed(); g.push(n.id); store(DISMISSED, JSON.stringify(g.slice(-50))); paintStart(); });
            f.appendChild(x); b.appendChild(f); box.appendChild(b);
        });
        var ex = expiry(m);
        if (ex) { var e = el('div', 'lb-expiry'); e.dataset.level = ex.level; e.setAttribute('role', 'status'); e.appendChild(document.createTextNode(ex.text + ' ')); var a = el('button', 'lb-link', 'Membership'); a.type = 'button'; a.addEventListener('click', function () { openSettings('membership'); }); e.appendChild(a); box.appendChild(e); }
        // member card
        var tier = tierOf(m), c = memberCard(m, 'strip', { tag: 'button' }); c.classList.add('lb-card'); c.id = 'lbMemberCard'; c.setAttribute('aria-label', 'Membership: ' + (m.name || '') + ', number ' + pad(m.number));
        c.addEventListener('click', function () { openSettings('membership'); }); box.appendChild(c);
        if (tier === 'ordinal' || tier === 'cardinal' || tier === 'prime') {
            var l = (m.plan && m.plan.limits) || {}, pl = plansLine(m), ln = [];
            if (l.tabs) ln.push(l.tabs + ' tabs'); if (l.dailyMinutes) ln.push(l.dailyMinutes / 60 + ' hours a day');
            var line = el('div', 'lb-planline'); line.appendChild(document.createTextNode((TIER_NAME[tier] + (ln.length ? ': ' + ln.join(', ') : '')) + '. ')); line.appendChild(pl.firstChild ? pl : document.createTextNode('')); box.appendChild(line);
        }
        var d = dayState(); if (d && d.left <= 0) { var f2 = el('div', 'lb-planline', 'Your time for today is finished.'); box.appendChild(f2); }
    }
    document.addEventListener('lb-member', function () {
        var m = member(); if (m) { store(ME_KEY, JSON.stringify({ name: m.name || '', number: m.number, tier: tierOf(m) })); paintSplash(m.name, m.number, tierOf(m)); }
        paintStart(); paintRailMe(); dayCheck(); maybeTour(); grantCheck(m);
    });

    /* ---------- Plan limits shown in the app: tab cap and the daily time (Ordinal, client side only: public relays never reach our gate, PLAN 0.3) ---------- */
    function limits() { var m = member(); return m && m.plan && m.plan.limits || null; }
    window.LB_tabGate = function (count) {
        var l = limits(), cap = l && l.tabs; var m = member();
        if (!cap || count < cap) return true;
        if (tierOf(m) === 'ordinal') return 'plans';   // 1.1: Ordinal's 5th tab is the buy page (createTab opens limitless://plans)
        var tier = tierOf(m), old = $('lbCapDlg'); if (old) old.remove();
        var d = el('div', 'lb-dlg'); d.id = 'lbCapDlg'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-labelledby', 'lbCapT');
        var card = el('div', 'lb-dlg-card'); var h = el('h2', 'lb-dlg-t', tier === 'prime' ? 'Why are you using so many tabs!?' : 'That is all your tabs'); h.id = 'lbCapT';
        card.appendChild(h);
        card.appendChild(el('p', 'lb-note', 'Your ' + TIER_NAME[tier] + ' plan allows ' + cap + ' open tabs. Close one to open another.'));
        if (tier !== 'prime' && tier !== 'executive') card.appendChild(plansLine(m));
        var row = el('div', 'lb-dlg-row'); var ok = el('button', 'lb-btn lb-btn-p', 'Got it'); ok.type = 'button'; ok.addEventListener('click', function () { d.remove(); }); row.appendChild(ok); card.appendChild(row); d.appendChild(card); document.body.appendChild(d); ok.focus();
        d.addEventListener('keydown', function (e) { if (e.key === 'Escape') d.remove(); });
        return false;
    };
    var DT = 'limitless:daytime:v1';
    function today() { var n = new Date(); return n.getFullYear() + '-' + (n.getMonth() + 1) + '-' + n.getDate(); }
    function dayRead() { try { var j = JSON.parse(store(DT) || 'null'); if (j && j.day === today()) return j; } catch (_) {} return { day: today(), ms: 0 }; }
    function dayState() {
        var l = limits(), m = member(); if (!m || tierOf(m) !== 'ordinal' || !l || !l.dailyMinutes) return null;
        var left = l.dailyMinutes * 60000 - dayRead().ms; return { left: left, limit: l.dailyMinutes * 60000 };
    }
    function dayAdd(ms) { var d = dayRead(); d.ms += ms; store(DT, JSON.stringify(d)); dayCheck(); }
    function dayCheck() {
        var st = dayState(), done = $('lbDayDone'), note = $('lbDayNote');
        if (!st) { if (done) done.remove(); if (note) note.remove(); return; }
        if (st.left <= 0) {
            if (note) note.remove();
            if (!done) {
                done = el('div', 'lb-dayDone'); done.id = 'lbDayDone'; done.setAttribute('role', 'alert');
                done.appendChild(el('h2', null, 'Your time for today is finished')); done.appendChild(el('p', null, 'It starts again tomorrow. Settings and your membership page stay open.'));
                done.appendChild(plansLine(member())); document.querySelector('main').appendChild(done);
            }
            return;
        }
        if (done) done.remove();
        if (st.left <= 15 * 60000 && !note && store('limitless:daynote:v1') !== today()) {
            note = el('div', 'lb-ub show'); note.id = 'lbDayNote'; note.setAttribute('role', 'status');
            note.appendChild(el('i', 'lb-ub-dot')); note.appendChild(el('span', 'lb-ub-msg', 'About 15 minutes left today on your plan')); note.appendChild(el('span', 'lb-ub-gap'));
            var x = el('button', 'lb-ub-x'); x.type = 'button'; x.setAttribute('aria-label', 'Dismiss'); x.appendChild(icon('close')); x.addEventListener('click', function () { store('limitless:daynote:v1', today()); note.remove(); }); note.appendChild(x);
            var mn = document.querySelector('main'); mn.parentNode.insertBefore(note, mn);
        }
    }
    window.LBUI.dayTime = { add: dayAdd, state: dayState, check: dayCheck };
    setInterval(function () { if (dayState() && document.visibilityState === 'visible' && document.hasFocus()) dayAdd(15000); }, 15000);

    /* ---------- Tour (UI.md 6.1 step 6): three steps, skippable, once. Replaces the old 18-step tutorial. Not modal: it never blocks the page. ---------- */
    var TOUR = 'limitless:tour:v1';
    var STEPS = [['Themes', 'Open the menu and choose Theme to change how Limitless looks. Your plan decides which ones are open.', 'palette'], ['Start page shortcuts', 'Add the sites you use most on the start page. They stay on this device.', 'star'], ['Your membership', 'Your name, number and plan are in Settings, under Membership.', 'card']];
    function maybeTour() {
        if (!member() || store(TOUR) === 'done' || $('lbTour')) return;
        var i = 0, box = el('div', 'lb-tour'); box.id = 'lbTour'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Quick tour');
        function paint() {
            box.textContent = ''; var st = STEPS[i];
            var h = el('div', 'lb-tour-h'); h.appendChild(icon(st[2])); h.appendChild(el('strong', null, st[0])); h.appendChild(el('span', 'lb-tour-c', (i + 1) + ' of 3'));
            var r = el('div', 'lb-dlg-row');
            var skip = el('button', 'lb-btn', 'Skip tour'); skip.type = 'button'; skip.addEventListener('click', finish);
            var nx = el('button', 'lb-btn lb-btn-p', i === 2 ? 'Done' : 'Next'); nx.type = 'button'; nx.id = 'lbTourNext'; nx.addEventListener('click', function () { if (i === 2) finish(); else { i++; paint(); } });
            r.append(skip, nx); box.append(h, el('p', 'lb-note', st[1]), r);
        }
        function finish() { store(TOUR, 'done'); box.remove(); }
        paint(); document.body.appendChild(box);
    }

    /* ---------- 1.0 video and data (slice/1.0-videoui): video cap, one video at a time, auto Data saver, data meter, site report.
       Each has its own switch in LB_features (videoCap, oneVideo, autoSaver, dataMeter, siteReport). ---------- */
    function feat(k) { try { return window.LB_features[k] !== false; } catch (_) { return true; } }
    function videoCap() { var l = limits(), c = l && Number(l.videoMaxP); return feat('videoCap') && c > 0 ? c : 0; }
    window.LB_videoConfig = function (baseUrl) {
        var h = ''; try { h = new URL(baseUrl).hostname; } catch (_) {}
        return { cap: videoCap(), one: feat('oneVideo'), yt: /(^|\.)youtube(-nocookie)?\.com$/.test(h) };
    };
    /* The first-time-per-session note, called from the page runtime. */
    window.LB_videoNote = function (cap) {
        if (!cap) return;
        try { if (sessionStorage.getItem('limitless:videonote:v1')) return; sessionStorage.setItem('limitless:videonote:v1', '1'); } catch (_) {}
        var n = el('div', 'lb-vnote'); n.id = 'lbVideoNote'; n.setAttribute('role', 'status');
        n.appendChild(el('span', null, 'Video is limited to ' + cap + 'p on your plan.'));
        var x = el('button', 'lb-ub-x'); x.type = 'button'; x.setAttribute('aria-label', 'Dismiss'); x.appendChild(icon('close')); x.addEventListener('click', function () { n.remove(); });
        n.appendChild(x); document.body.appendChild(n); setTimeout(function () { n.remove(); }, 9000);
    };
    /* Runs inside every proxied page (injected by makeProxyScript as source text), so it cannot use anything from this file. */
    window.LB_videoRuntime = String(function (C) {
        if (!C || (!C.cap && !C.one)) return;
        var Q = [['tiny', 144], ['small', 240], ['medium', 360], ['large', 480], ['hd720', 720], ['hd1080', 1080], ['hd1440', 1440], ['hd2160', 2160], ['highres', 4320]];
        var noted = false;
        function note() { if (noted || !C.cap) return; noted = true; try { window.top.LB_videoNote(C.cap); } catch (_) {} }
        function each(sel, fn) { [].forEach.call(document.querySelectorAll(sel), fn); }
        var timer = 0, jobs = [];
        function later(fn) { jobs.push(fn); if (!timer) timer = setTimeout(function () { timer = 0; jobs.forEach(function (f) { try { f(); } catch (_) {} }); }, 100); }
        function onDom(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
        if (C.cap && C.yt) {
            var max = 'tiny', names = Q.map(function (q) { return q[0]; });
            Q.forEach(function (q) { if (q[1] <= C.cap) max = q[0]; });
            var apply = window.__lbYtApply = function () {
                var p = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
                if (!p || !p.setPlaybackQualityRange) return;
                try {
                    p.setPlaybackQualityRange('tiny', max);
                    var cur = p.getPlaybackQuality && p.getPlaybackQuality();
                    if (cur && names.indexOf(cur) > names.indexOf(max)) p.setPlaybackQuality(max);
                    if (!p.__lbq) { p.__lbq = 1; if (p.addEventListener) p.addEventListener('onStateChange', '__lbYtApply'); note(); }
                } catch (_) {}
            };
            setInterval(apply, 1500);
        }
        if (C.cap && !C.yt) {
            var res = function (s) {
                var t = ['size', 'res', 'data-res', 'data-quality', 'label', 'title', 'data-real-src', 'data-lb-src', 'src'].map(function (a) { return s.getAttribute(a) || ''; }).join(' ');
                var m = /(\d{3,5})\s*[x×]\s*(\d{3,4})/.exec(t) || /(?:^|[^\d])(\d{3,4})\s*p\b/i.exec(t) || /^\s*(\d{3,4})\s*$/.exec(s.getAttribute('size') || s.getAttribute('res') || s.getAttribute('data-res') || '');
                return m ? Number(m[2] || m[1]) : 0;
            };
            var fit = function () {
                each('video', function (v) {
                    if (v.__lbq || v.currentTime > 0) return;
                    var ss = [].slice.call(v.querySelectorAll('source')); if (ss.length < 2) return;
                    var best = null, bh = 0, low = null, lh = 1e9;
                    ss.forEach(function (s) { var x = res(s); if (!x) return; if (x <= C.cap && x > bh) { best = s; bh = x; } if (x < lh) { low = s; lh = x; } });
                    var pick = best || low; if (!pick) return;
                    v.__lbq = 1;
                    if (v.firstElementChild !== pick) { v.insertBefore(pick, v.firstChild); try { v.load(); } catch (_) {} }
                });
            };
            onDom(function () { fit(); new MutationObserver(function () { later(fit); }).observe(document.documentElement, { childList: true, subtree: true }); });
            document.addEventListener('play', note, true);
        }
        if (C.one) {
            var auto = function (v) { return (v.muted || v.defaultMuted) && !v.__lbUser; };
            var io = window.IntersectionObserver && new IntersectionObserver(function (es) {
                es.forEach(function (e) {
                    var v = e.target; v.__lbIn = e.isIntersecting;
                    if (!e.isIntersecting && auto(v) && !v.paused) { v.__lbAP = 1; v.pause(); }
                    else if (e.isIntersecting && v.__lbAP) { v.__lbAP = 0; v.__lbRes = 1; try { var r = v.play(); if (r && r.catch) r.catch(function () {}); } catch (_) {} }
                });
            });
            var watch = function () { if (io) each('video', function (v) { if (!v.__lbW) { v.__lbW = 1; io.observe(v); } }); };
            onDom(function () { watch(); new MutationObserver(function () { later(watch); }).observe(document.documentElement, { childList: true, subtree: true }); });
            ['pointerdown', 'keydown', 'click'].forEach(function (t) { document.addEventListener(t, function (e) { var v = e.target && e.target.closest && e.target.closest('video'); if (v) v.__lbUser = 1; }, true); });
            document.addEventListener('play', function (e) {
                var v = e.target; if (!v || v.tagName !== 'VIDEO') return;
                if (v.__lbRes) { v.__lbRes = 0; return; }
                if (navigator.userActivation && navigator.userActivation.isActive) v.__lbUser = 1;
                else if (auto(v) && v.__lbIn === false) { v.__lbAP = 1; v.pause(); }
            }, true);
        }
    });
    /* A tab that goes to the background pauses its media, also inside iframes (embedded players). */
    window.LB_pauseMedia = function (doc) {
        try {
            doc.querySelectorAll('video, audio').forEach(function (m) { try { m.pause(); } catch (_) {} });
            if (feat('oneVideo')) doc.querySelectorAll('iframe').forEach(function (f) { try { if (f.contentDocument) window.LB_pauseMedia(f.contentDocument); } catch (_) {} });
        } catch (_) {}
    };

    /* Data saver at 90 % (once per allowance period) */
    var AS = 'limitless:autosaver:v1';
    function periodEnd(c) {
        var e = Number(c.periodEnd || c.endsAt || c.resetsAt); if (e > Date.now()) return e;
        var n = new Date();
        if (c.period === 'week') return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + (8 - (n.getUTCDay() || 7)));
        return Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 1);
    }
    function autoSaver() {
        var m = member(), c = m && m.plan && m.plan.cap, ls = window.LB_ls;
        if (!feat('autoSaver') || !c || !(c.capGb > 0) || !(c.usedGb / c.capGb >= 0.9) || !ls) return;
        try { var st = JSON.parse(store(AS) || 'null'); if (st && st.end > Date.now()) return; } catch (_) {}
        store(AS, JSON.stringify({ end: periodEnd(c) }));
        if (ls.getItem('limitless:datasaver:v1') === '1') return;
        ls.setItem('limitless:datasaver:v1', '1');
        var sw = $('settingsDataSaverSwitch'); if (sw) sw.classList.add('on');
        if ($('lbAutoSaverNote')) return;
        var note = el('div', 'lb-ub show'); note.id = 'lbAutoSaverNote'; note.setAttribute('role', 'status');
        note.appendChild(el('i', 'lb-ub-dot'));
        note.appendChild(el('span', 'lb-ub-msg', 'You have used 90 % of this ' + (c.period === 'week' ? "week's" : "month's") + ' allowance, so Data saver is on. You can turn it off in Settings.'));
        note.appendChild(el('span', 'lb-ub-gap'));
        var x = el('button', 'lb-ub-x'); x.type = 'button'; x.setAttribute('aria-label', 'Dismiss'); x.appendChild(icon('close')); x.addEventListener('click', function () { note.remove(); }); note.appendChild(x);
        var mn = document.querySelector('main'); if (mn) mn.parentNode.insertBefore(note, mn);
    }
    document.addEventListener('lb-member', autoSaver);

    /* Data meter in the menu */
    function num(x) { return String(+(+x).toFixed(1)); }
    function bar(label, used, cap) {
        var row = el('div', 'lb-mm-row'); row.appendChild(el('div', 'lb-mm-l', label));
        var b = el('div', 'lb-bar'); b.setAttribute('role', 'progressbar'); b.setAttribute('aria-label', label);
        b.setAttribute('aria-valuemin', '0'); b.setAttribute('aria-valuemax', String(cap)); b.setAttribute('aria-valuenow', String(Math.min(used, cap)));
        var f = el('i'); f.style.width = Math.max(0, Math.min(100, used / cap * 100)) + '%'; b.appendChild(f); row.appendChild(b); return row;
    }
    function paintMeter() {
        var box = menu && menu.querySelector('.lb-mm'); if (!box) return;
        box.textContent = ''; box.hidden = true;
        var m = member(); if (!feat('dataMeter') || !m || m.membership !== 'on' || tierOf(m) === 'ordinal') return;
        var c = m.plan && m.plan.cap, d = m.plan && m.plan.download;
        if (c && c.capGb > 0) box.appendChild(bar('Used ' + num(c.usedGb) + ' of ' + num(c.capGb) + ' GB this ' + (c.period || 'week'), c.usedGb, c.capGb));
        if (d && d.capGb > 0) box.appendChild(bar('Downloads ' + num(d.usedGb) + ' of ' + num(d.capGb) + ' GB this month', d.usedGb, d.capGb));
        box.hidden = !box.firstChild;
    }

    /* Per-site usage on this device (never sent anywhere) */
    var SU = 'limitless:siteusage:v1';
    var PRIV = ['github.io', 'gitlab.io', 'pages.dev', 'netlify.app', 'vercel.app', 'herokuapp.com', 'blogspot.com', 'workers.dev', 'web.app', 'firebaseapp.com', 'azurewebsites.net', 'cloudfront.net'];
    function siteOf(host) {
        host = String(host).toLowerCase().replace(/\.$/, '');
        if (/^[\d.]+$/.test(host) || host.indexOf(':') >= 0) return host;
        var p = host.split('.'); if (p.length <= 2) return host;
        var l2 = p.slice(-2).join('.');
        return p.slice(p.length > 2 && (/^(co|com|org|net|gov|edu|ac|or|ne|go)\.[a-z]{2}$/.test(l2) || PRIV.indexOf(l2) >= 0) ? -3 : -2).join('.');
    }
    function dayKey(t) { var n = new Date(t || Date.now()); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'); }
    var siteData = null, siteTimer = 0;
    function siteLoad() { if (siteData) return siteData; try { siteData = JSON.parse(store(SU) || 'null'); } catch (_) {} if (!siteData || typeof siteData.days !== 'object') siteData = { days: {} }; return siteData; }
    function siteSave() {
        siteTimer = 0; var d = siteLoad(), keep = Object.keys(d.days).sort().slice(-31); Object.keys(d.days).forEach(function (k) { if (keep.indexOf(k) < 0) delete d.days[k]; });
        store(SU, JSON.stringify(d));
    }
    window.LB_siteBytes = function (url, n) {
        if (!feat('siteReport') || !(n > 0)) return;
        var host; try { host = new URL(url).hostname; } catch (_) { return; }
        var s = siteOf(host), d = siteLoad(), day = d.days[dayKey()] || (d.days[dayKey()] = {});
        if (!(s in day) && Object.keys(day).length >= 200) s = '(other sites)';
        day[s] = (day[s] || 0) + n;
        if (!siteTimer) siteTimer = setTimeout(siteSave, 2000);
    };
    window.LB_siteReport = function () { // top sites of the last 7 days: [{site, bytes}], most first
        var d = siteLoad(), tot = {}, from = dayKey(Date.now() - 6 * 864e5);
        Object.keys(d.days).forEach(function (k) { if (k >= from) Object.keys(d.days[k]).forEach(function (s) { tot[s] = (tot[s] || 0) + d.days[k][s]; }); });
        return Object.keys(tot).map(function (s) { return { site: s, bytes: tot[s] }; }).sort(function (a, b) { return b.bytes - a.bytes; });
    };
    window.addEventListener('pagehide', function () { if (siteTimer) { clearTimeout(siteTimer); siteSave(); } });
    function mb(b) { var x = b / 1048576; return (x >= 100 ? x.toFixed(0) : x.toFixed(1)) + ' MB'; }
    function siteCard() {
        var c = el('div', 'settings-card'), h = el('div', 'settings-card-head'); h.appendChild(icon('check')); h.appendChild(document.createTextNode(' Where your data went'));
        var b = el('div', 'settings-card-body'); b.id = 'lbSiteReport';
        var all = window.LB_siteReport(), tot = all.reduce(function (a, r) { return a + r.bytes; }, 0);
        if (!all.length) b.appendChild(el('div', 'lb-note', 'Nothing recorded yet this week.'));
        else {
            b.appendChild(el('div', 'lb-note', 'The sites that used the most this week.'));
            var dl = el('dl', 'lb-dl'); all.slice(0, 10).forEach(function (r) { dl.appendChild(el('dt', null, r.site)); dl.appendChild(el('dd', null, mb(r.bytes) + ' (' + Math.round(r.bytes / tot * 100) + ' %)')); });
            b.appendChild(dl);
        }
        b.appendChild(el('div', 'lb-note', 'This list stays on this device. Limitless does not send it to us.'));
        var clr = el('button', 'lb-btn', 'Clear'); clr.type = 'button'; clr.id = 'lbSiteClear';
        clr.addEventListener('click', function () { siteData = { days: {} }; if (siteTimer) { clearTimeout(siteTimer); siteTimer = 0; } store(SU, JSON.stringify(siteData)); paintMembership(); });
        b.appendChild(clr); c.append(h, b); return c;
    }

    function ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
    ready(function () {
        buildMenu(); placeShield(); applyDev(); buildUrlView(); buildTabs(); buildSettings(); splashFromCache(); paintStart();
        new MutationObserver(placeShield).observe(document.documentElement, { attributes: true, attributeFilter: ['data-skin'] });
    });
})();
