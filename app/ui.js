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
    function markSvg(tier) {
        var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 64 64'); s.setAttribute('class', 'lb-mk lb-tier-mark'); s.setAttribute('aria-hidden', 'true');
        var u = document.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', '#lb-mk-tier-' + (TIER_NAME[tier] ? tier : 'ordinal')); s.appendChild(u); return s;
    }
    window.LBUI = { el: el, icon: icon, store: store, member: member, tierOf: tierOf, pad: pad, markSvg: markSvg, TIER_NAME: TIER_NAME, STANDING: STANDING };

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
        ['membership', 'card', 'Membership', '', function () { openSettings('membership'); }],
        ['report', 'flag', 'Report a problem', '', function () { if (window.LBReport) window.LBReport.open(); }],
        ['settings', 'gear', 'Settings', 'Alt+P', proxy('settingsBtn')],
        ['dev', 'code', 'Developer mode', '', function () { setDev(!devOn()); }, 'check']
    ];
    function paintHeader() {
        var h = menu.querySelector('.lb-mh'); if (!h) return;
        h.textContent = '';
        var m = member();
        h.appendChild(markSvg(tierOf(m)));
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
        paintHeader(); applyDev();
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
        document.addEventListener('lb-member', function () { if (!menu.hidden) paintHeader(); });
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

    /* ---------- Report a problem (ADMIN.md 8). POST /_lb/reports is the gate's S7/S9 route; until it exists the dialog says so. ---------- */
    var CATS = ['Slow', 'Broken site', 'Looks wrong', 'Account', 'Bot check', 'Other'];
    window.LBReport = {
        open: function (cat, host) {
            var old = $('lbReportDlg'); if (old) old.remove();
            var d = el('div', 'lb-dlg'); d.id = 'lbReportDlg'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-labelledby', 'lbRepT');
            var card = el('div', 'lb-dlg-card');
            var h = el('h2', 'lb-dlg-t', 'Report a problem'); h.id = 'lbRepT';
            var sel = el('select', 'lb-dlg-in'); sel.id = 'lbRepCat'; sel.setAttribute('aria-label', 'Category');
            CATS.forEach(function (c) { var o = el('option', null, c); o.value = c; if (c === cat) o.selected = true; sel.appendChild(o); });
            var note = el('textarea', 'lb-dlg-in'); note.id = 'lbRepNote'; note.maxLength = 500; note.rows = 4; note.placeholder = 'What happened? (500 characters)'; note.setAttribute('aria-label', 'What happened');
            var lab = el('label', 'lb-dlg-tick'); var tick = el('input'); tick.type = 'checkbox'; tick.id = 'lbRepHost'; lab.append(tick, el('span', null, "Include the site's address (domain only)"));
            var msg = el('div', 'lb-note'); msg.id = 'lbRepMsg'; msg.setAttribute('role', 'status');
            var row = el('div', 'lb-dlg-row'); var cancel = el('button', 'lb-btn', 'Cancel'); cancel.type = 'button'; var send = el('button', 'lb-btn lb-btn-p', 'Send'); send.type = 'button'; send.id = 'lbRepSend';
            row.append(cancel, send); card.append(h, sel, note, lab, msg, row); d.appendChild(card); document.body.appendChild(d);
            function close() { d.remove(); document.removeEventListener('keydown', esc, true); if (menuBtn) menuBtn.focus(); }
            function esc(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
            cancel.onclick = close; document.addEventListener('keydown', esc, true);
            send.onclick = function () {
                send.disabled = true; msg.textContent = 'Sending';
                var body = { category: sel.value, note: note.value.slice(0, 500) };
                if (tick.checked && host) body.host = host;
                fetch('/_lb/reports', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
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
        if (l.downloadMbPerFile != null && l.downloadsPerDay != null) out.push(['Downloads', 'up to ' + l.downloadMbPerFile + ' MB each, ' + l.downloadsPerDay + ' a day']);
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
        var a = el('a', null, 'See the plans'); a.href = 'https://hall.taps-holdings.org/'; a.target = '_blank'; a.rel = 'noopener'; n.appendChild(a); return n;
    }
    window.LBUI.plansLine = plansLine;
    function paintMembership() {
        var root = $('lbMemberPage'); if (!root) return;
        var m = member(); root.textContent = '';
        var card = el('div', 'settings-card'), body = el('div', 'settings-card-body');
        if (!m) { body.appendChild(el('div', 'settings-hint', 'Membership details appear here once you are signed in with a member account.')); card.appendChild(body); root.appendChild(card); return; }
        var tier = tierOf(m), top = el('div', 'lb-mp-top'); top.appendChild(markSvg(tier));
        var id = el('div'); id.appendChild(el('div', 'lb-mp-name', m.name || 'Member'));
        id.appendChild(el('div', 'lb-mp-num', 'No. ' + pad(m.number)));
        var bits = [TIER_NAME[tier], STANDING[m.standing] + (m.standing === 'suspended' && m.standingUntil ? ' until ' + fmtDate(m.standingUntil) : '')];
        if (m.admittedAt) bits.push('Member since ' + fmtMonth(m.admittedAt));
        id.appendChild(el('div', 'lb-note', bits.join(' · ')));
        top.appendChild(id); body.appendChild(top); card.appendChild(body); root.appendChild(card);
        var pc = el('div', 'settings-card'), ph = el('div', 'settings-card-head'); ph.appendChild(icon('card')); ph.appendChild(document.createTextNode(' Your plan'));
        var pb = el('div', 'settings-card-body'); pb.appendChild(el('div', 'settings-switch-label', TIER_NAME[tier] + ' plan'));
        var ex = expiry(m); if (m.plan && m.plan.paidUntil && tier !== 'ordinal') pb.appendChild(el('div', 'lb-note' + (ex ? ' lb-warn' : ''), ex ? ex.text : 'Paid until ' + fmtDate(m.plan.paidUntil) + '.'));
        var dl = el('dl', 'lb-dl'); limitLines(m).forEach(function (r) { dl.appendChild(el('dt', null, r[0])); dl.appendChild(el('dd', null, r[1])); });
        var u = m.plan && m.plan.used; if (u) { dl.appendChild(el('dt', null, 'Used today')); dl.appendChild(el('dd', null, gib(u.todayBytes || 0))); }
        pb.appendChild(dl); if (tier === 'ordinal' || tier === 'cardinal' || tier === 'prime') pb.appendChild(plansLine(m));
        pc.append(ph, pb); root.appendChild(pc);
        var cc = el('div', 'settings-card'), ch = el('div', 'settings-card-head'); ch.appendChild(icon('check')); ch.appendChild(document.createTextNode(' Certificate and Charter'));
        var cb = el('div', 'settings-card-body');
        if (m.certificateCode) {
            cb.appendChild(el('div', 'lb-note', 'Certificate code ' + m.certificateCode));
            ['screen', 'print'].forEach(function (v) { var a = el('a', 'lb-btn', v === 'screen' ? 'Download PDF (screen)' : 'Download PDF (print)'); a.href = '/_lb/me/certificate.pdf?variant=' + v; a.download = ''; a.style.marginRight = '8px'; cb.appendChild(a); });
        } else cb.appendChild(el('div', 'lb-note', 'Certificates begin at the Cardinal plan. Your member card is on the start page.'));
        var ch2 = el('div', 'lb-note', 'Charter version ' + (m.charterVersion || 'not signed') + '. '); var ra = el('a', null, 'Read the Rules'); ra.href = '/legal/terms.html'; ra.target = '_blank'; ra.rel = 'noopener'; ch2.appendChild(ra);
        cb.appendChild(ch2); cc.append(ch, cb); root.appendChild(cc);
    }
    document.addEventListener('lb-member', function () { var g = document.querySelector('.settings-section[data-section="membership"]'); if (g && g.style.display === 'flex') paintMembership(); });

    /* ---------- Bot check (a plain card, never a way around it): TESTING 10 ---------- */
    window.LB_botCheck = function (status, html) {
        if (status !== 403 && status !== 429 && status !== 503) return false;
        return /cf-chl|cdn-cgi\/challenge-platform|Just a moment\.\.\.|g-recaptcha|h-captcha|hcaptcha\.com\/1\/api|Attention Required! \| Cloudflare/i.test(String(html).slice(0, 60000));
    };

    /* ---------- Splash: the member's name, the number small beneath (UI.md 4). Cached per device (limitless:me:v1: name and number only) ---------- */
    var ME_KEY = 'limitless:me:v1';
    function paintSplash(name, number) {
        var w = document.querySelector('.lb-sp-word'); if (!w) return;
        if (!name) return;
        w.textContent = name; w.classList.add('lb-sp-name');
        var n = document.querySelector('.lb-sp-num');
        if (!n) { n = el('div', 'lb-sp-num'); w.parentNode.insertBefore(n, w.nextSibling); }
        n.textContent = number != null && number !== '' ? 'No. ' + pad(number) : '';
    }
    function splashFromCache() { try { var c = JSON.parse(store(ME_KEY) || 'null'); if (c && c.name) paintSplash(String(c.name).slice(0, 80), c.number); } catch (_) {} }

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
        var tier = tierOf(m), c = el('button', 'lb-card lb-card-' + tier); c.type = 'button'; c.id = 'lbMemberCard'; c.setAttribute('aria-label', 'Membership: ' + (m.name || '') + ', number ' + pad(m.number));
        c.appendChild(markSvg(tier));
        var t = el('span', 'lb-card-t'); t.appendChild(el('span', 'lb-card-n', (m.name || 'Member') + ' · No. ' + pad(m.number)));
        t.appendChild(el('span', 'lb-card-s', TIER_NAME[tier] + (m.admittedAt ? ' · since ' + fmtMonth(m.admittedAt) : '')));
        c.appendChild(t); c.addEventListener('click', function () { openSettings('membership'); }); box.appendChild(c);
        if (tier === 'ordinal' || tier === 'cardinal' || tier === 'prime') {
            var l = (m.plan && m.plan.limits) || {}, pl = plansLine(m), ln = [];
            if (l.tabs) ln.push(l.tabs + ' tabs'); if (l.dailyMinutes) ln.push(l.dailyMinutes / 60 + ' hours a day');
            var line = el('div', 'lb-planline'); line.appendChild(document.createTextNode((TIER_NAME[tier] + (ln.length ? ': ' + ln.join(', ') : '')) + '. ')); line.appendChild(pl.firstChild ? pl : document.createTextNode('')); box.appendChild(line);
        }
        var d = dayState(); if (d && d.left <= 0) { var f2 = el('div', 'lb-planline', 'Your time for today is finished.'); box.appendChild(f2); }
    }
    document.addEventListener('lb-member', function () {
        var m = member(); if (m) { store(ME_KEY, JSON.stringify({ name: m.name || '', number: m.number })); paintSplash(m.name, m.number); }
        paintStart(); dayCheck(); maybeTour();
    });

    /* ---------- Plan limits shown in the app: tab cap and the daily time (Ordinal, client side only: public relays never reach our gate, PLAN 0.3) ---------- */
    function limits() { var m = member(); return m && m.plan && m.plan.limits || null; }
    window.LB_tabGate = function (count) {
        var l = limits(), cap = l && l.tabs; var m = member();
        if (!cap || count < cap) return true;
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

    function ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
    ready(function () {
        buildMenu(); placeShield(); applyDev(); buildUrlView(); buildTabs(); buildSettings(); splashFromCache(); paintStart();
        new MutationObserver(placeShield).observe(document.documentElement, { attributes: true, attributeFilter: ['data-skin'] });
    });
})();
