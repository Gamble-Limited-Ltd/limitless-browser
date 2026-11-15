/* Welcome ceremony (docs/1.0/UI.md 6.1, MEMBERSHIP.md 6). Display only: the gate decides every state. All dynamic text uses textContent.
 * Gate contract used here: GET /auth/welcome/state (JSON, built in the gate for S6; 401 {to} when signed out), GET /auth/welcome/number?n=,
 * POST /auth/welcome/number (form n), POST /auth/welcome/sign (form name, agree), POST /auth/welcome/step (form step). */
(function () {
    'use strict';
    var root = document.getElementById('cwStep'), dots = document.getElementById('cwDots');
    var NAMES = { ordinal: 'Ordinal', cardinal: 'Cardinal', prime: 'Prime', executive: 'Executive' };
    var S = null, step = 1, reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function form(o) { var b = new URLSearchParams(); Object.keys(o).forEach(function (k) { b.set(k, o[k]); }); return { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: b.toString() }; }
    function post(url, o) { return fetch(url, form(o)); }
    function mark(tier) {
        var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 64 64'); s.setAttribute('class', 'mk'); s.setAttribute('aria-hidden', 'true');
        var p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', 'M53.92 30.08A22 22 0 1 1 41.30 12.06'); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '6'); p.setAttribute('stroke-linecap', 'round'); s.appendChild(p);
        var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); c.setAttribute('cx', '50.02'); c.setAttribute('cy', '19.38'); c.setAttribute('r', '5.5'); c.setAttribute('fill', 'currentColor'); s.appendChild(c);
        s.style.color = tier === 'executive' ? '#e6c15a' : tier === 'prime' ? '#e5506a' : tier === 'cardinal' ? '#c9d0da' : 'var(--lb-acc)'; return s;
    }
    function paintDots() { dots.textContent = ''; for (var i = 1; i <= 6; i++) { var li = el('li'); if (i <= step) li.setAttribute('data-on', ''); dots.appendChild(li); } dots.setAttribute('aria-label', 'Step ' + step + ' of 6'); }
    function show(n) { step = n; paintDots(); root.textContent = ''; root.style.animation = 'none'; void root.offsetWidth; root.style.animation = ''; STEPFN[n](); root.focus(); }
    function btn(label, fn, cls) { var b = el('button', cls || '', label); b.type = 'button'; b.addEventListener('click', fn); return b; }
    function pad(n) { return String(n).padStart(4, '0'); }
    function load() { return fetch('/auth/welcome/state', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { if (r.status === 401) return r.json().then(function (j) { if (j.to) location.href = j.to; throw new Error('signin'); }); if (!r.ok) throw new Error('state'); return r.json(); }).then(function (j) { S = j; return j; }); }

    var STEPFN = {
        1: function () {
            root.append(mark(S.tier), el('h1', null, S.kind === 'existing' ? 'Welcome to Limitless 1.0' : 'Welcome'));
            root.append(el('p', null, S.kind === 'invited' ? 'You were invited by the Director of Gamble Limited Ltd. This takes about two minutes: choose your number, sign the Charter, and see your membership.' : S.kind === 'existing' ? 'Limitless now has memberships. This takes about two minutes: sign the Charter and see your membership. Your number is already yours.' : 'You have been approved. This takes about two minutes: choose your number, sign the Charter, and see your membership.'));
            if (S.kind === 'invited') { root.append(el('p', 'note', 'James Thiessen, Director of Gamble Limited Ltd.')); }
            var next = S.number ? 3 : 2;
            root.append(btn('Begin', function () { post('/auth/welcome/step', { step: 1 }); show(next); }));
        },
        2: function () {
            root.append(el('h1', null, 'Choose your number'));
            root.append(el('p', null, 'Four digits. It is yours for good and is never reissued.'));
            var lab = el('label', 'lab', 'Number'); lab.htmlFor = 'cwNum';
            var inp = el('input', 'num'); inp.type = 'text'; inp.id = 'cwNum'; inp.inputMode = 'numeric'; inp.maxLength = 4; inp.autocomplete = 'off'; inp.value = S.suggested || '';
            var msg = el('div', 'msg'); msg.setAttribute('role', 'status'); var go = btn('Continue', claim); go.disabled = true;
            var timer = 0, seq = 0;
            var TEXT = { free: ['That number is free', 'ok'], unavailable: ['That number is unavailable', 'err'], not_for_plan: ['Not available for your plan', 'err'], invalid: ['Enter four digits', 'err'], has_number: ['You already have a number', 'ok'] };
            function check() {
                var v = inp.value.replace(/\D/g, '').slice(0, 4); inp.value = v; go.disabled = true; msg.removeAttribute('data-ok'); msg.removeAttribute('data-err');
                if (v.length < 4) { msg.textContent = v ? 'Enter four digits' : ''; return; }
                var my = ++seq; msg.textContent = 'Checking';
                fetch('/auth/welcome/number?n=' + encodeURIComponent(v), { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
                    if (my !== seq) return; var t = TEXT[j.status] || ['That number is unavailable', 'err']; msg.textContent = t[0]; msg.setAttribute(t[1] === 'ok' ? 'data-ok' : 'data-err', ''); go.disabled = j.status !== 'free';
                }).catch(function () { if (my === seq) { msg.textContent = 'Could not check just now. Try again.'; msg.setAttribute('data-err', ''); } });
            }
            function claim() {
                go.disabled = true; post('/auth/welcome/number', { n: inp.value }).then(function () { return load(); }).then(function () { if (S.number) show(3); else { msg.textContent = 'That number could not be taken. Choose another.'; msg.setAttribute('data-err', ''); } }).catch(function () { msg.textContent = 'Something went wrong. Try again.'; msg.setAttribute('data-err', ''); go.disabled = false; });
            }
            inp.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(check, 180); });
            inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !go.disabled) claim(); });
            root.append(lab, inp, msg, go); if (inp.value) check(); inp.focus();
        },
        3: function () {
            root.append(el('h1', null, 'Sign the Charter'));
            root.append(el('p', 'note', 'Number ' + pad(S.number) + '. Charter version ' + S.charterVersion + '.'));
            var ch = el('div', 'charter'); ch.tabIndex = 0; ch.setAttribute('aria-label', 'Membership Charter, version ' + S.charterVersion);
            (S.charter || []).forEach(function (a) { ch.appendChild(el('b', null, a.title)); ch.appendChild(document.createTextNode(a.body)); }); root.append(ch);
            var lab = el('label', 'lab', 'Full legal name, as it will appear on your signed charter and any certificate'); lab.htmlFor = 'cwName';
            var name = el('input'); name.type = 'text'; name.id = 'cwName'; name.maxLength = 80; name.autocomplete = 'name';
            var sig = el('div', 'sig'); sig.setAttribute('aria-hidden', 'true');
            root.append(lab, name, sig, el('p', 'note', 'Why we ask: the Charter is signed in your own name. Only you and the Director can see it.'));
            var tl = el('label', 'tick'); var tk = el('input'); tk.type = 'checkbox'; tk.id = 'cwAgree'; tl.append(tk, el('span', null, 'I have read the Charter and the full Rules, version ' + S.charterVersion + '.')); root.append(tl);
            var msg = el('div', 'msg'); msg.setAttribute('role', 'alert'); var go = btn('Sign', sign); go.disabled = true; root.append(msg, go);
            function ok() { return /^[\p{L}][\p{L} .'’-]{1,79}$/u.test(name.value.trim()) && tk.checked; }
            function upd() { sig.textContent = name.value; go.disabled = !ok(); }
            name.addEventListener('input', upd); tk.addEventListener('change', upd);
            function sign() {
                go.disabled = true; msg.removeAttribute('data-err'); msg.textContent = '';
                post('/auth/welcome/sign', { name: name.value.trim(), agree: 'on' }).then(function () { return load(); }).then(function () { if (S.signed) { S.name = name.value.trim(); show(4); } else { msg.textContent = 'Use 2 to 80 letters, spaces, hyphens, apostrophes and full stops.'; msg.setAttribute('data-err', ''); go.disabled = false; } }).catch(function () { msg.textContent = 'This could not be signed. Try again.'; msg.setAttribute('data-err', ''); go.disabled = false; });
            }
            name.focus();
        },
        4: function () {
            var rv = el('div', 'reveal'); var ns = 'http://www.w3.org/2000/svg', s = document.createElementNS(ns, 'svg'); s.setAttribute('viewBox', '0 0 360 120'); s.setAttribute('role', 'img'); s.setAttribute('aria-label', 'Number ' + pad(S.number));
            var t = document.createElementNS(ns, 'text'); t.setAttribute('x', '180'); t.setAttribute('y', '92'); t.setAttribute('text-anchor', 'middle'); t.textContent = 'Nº ' + pad(S.number); s.appendChild(t);
            rv.append(s, el('i'), el('p', null, 'This number is yours for good.')); root.append(rv);
            root.append(btn('Continue', function () { show(5); }));
            if (!reduced) chime();
        },
        5: function () {
            var tier = S.tier;
            if (tier === 'ordinal') {
                root.append(el('h1', null, 'Your member card'));
                var c = el('div', 'card'); c.appendChild(mark(tier)); var t = el('div'); t.appendChild(el('b', null, S.name || 'Member')); t.appendChild(el('span', 'note', 'No. ' + pad(S.number) + ' · Ordinal')); c.appendChild(t); root.append(c);
                root.append(el('p', null, 'Certificates begin at the Cardinal plan.'));
            } else {
                root.append(el('h1', null, 'Your certificate'));
                var ce = el('div', 'cert'); ce.setAttribute('data-tier', tier);
                ce.append(el('div', 't', 'Limitless ' + NAMES[tier]), el('div', 'n', 'Nº ' + pad(S.number)), el('div', 'nm', S.name || ''), el('div', 'd', 'James Thiessen, Director of Gamble Limited Ltd.'));
                if (S.certificateCode) ce.append(el('div', 'd', 'Verification code ' + S.certificateCode)); root.append(ce);
                var r = el('div', 'row');
                [['screen', 'Download PDF (screen)'], ['print', 'Download PDF (print)']].forEach(function (v) { var a = el('a', 'btn g', v[1]); a.href = '/_lb/me/certificate.pdf?variant=' + v[0]; a.download = ''; r.appendChild(a); }); root.append(r);
            }
            root.append(btn('Continue', function () { show(6); }));
        },
        6: function () {
            root.append(el('h1', null, 'Three things to know'));
            var ul = el('ul', 'tour'); [['Themes', 'Open the menu and choose Theme. Your plan decides which are open.'], ['Start page shortcuts', 'Add the sites you use most. They stay on this device.'], ['Your membership', 'Your name, number and plan are in Settings, under Membership.']].forEach(function (x) { var li = el('li', null, x[0]); li.appendChild(el('span', null, x[1])); ul.appendChild(li); }); root.append(ul);
            var row = el('div', 'row'); var open = btn('Open Limitless', function () { try { localStorage.setItem('limitless:tour:v1', 'done'); } catch (e) {} post('/auth/welcome/step', { step: 6 }).finally(function () { location.assign('/'); }); });
            row.append(open); root.append(row);
        }
    };
    /* A soft two-note chime, synthesised (no audio file). Skipped with reduced motion; a browser that blocks audio just stays silent. */
    function chime() {
        try {
            var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; var ctx = new AC(), t = ctx.currentTime;
            [523.25, 783.99].forEach(function (f, i) { var o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t + i * 0.18); g.gain.exponentialRampToValueAtTime(0.05, t + i * 0.18 + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 1.2); o.connect(g); g.connect(ctx.destination); o.start(t + i * 0.18); o.stop(t + i * 0.18 + 1.3); });
        } catch (e) {}
    }
    load().then(function () {
        // Resume where the gate says we are: no number -> step 1 or 2, unsigned -> 3, signed -> 4 (the reveal) unless the gate has recorded a later step.
        var start = !S.number ? (S.step >= 1 ? 2 : 1) : !S.signed ? (S.step >= 1 ? 3 : 1) : Math.max(4, Math.min(6, S.step || 4));
        show(start);
    }).catch(function () { root.append(el('h1', null, 'We could not load this page'), el('p', null, 'Reload the page to try again.')); });
})();
