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

    function ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
    ready(function () {
        buildMenu(); placeShield(); applyDev(); buildUrlView(); buildTabs();
        new MutationObserver(placeShield).observe(document.documentElement, { attributes: true, attributeFilter: ['data-skin'] });
    });
})();
