// Layout and contrast checks run inside the page (TESTING 3): no horizontal page scroll, no text clipped without an ellipsis,
// no two text boxes overlapping, and 4.5:1 (3:1 from 24 px) for the text of the new S6 surfaces.
module.exports.checkLayout = (scope) => scope.evaluate(() => {
  const out = [];
  const path = (e) => { const p = []; for (; e && e.nodeType === 1 && p.length < 4; e = e.parentElement) p.push(e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/)[0] : '')); return p.join(' < '); };
  const visible = (e) => { for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0 || n.hidden || n.getAttribute('aria-hidden') === 'true') return false; } return true; };
  if (document.documentElement.scrollWidth > window.innerWidth + 1) out.push('horizontal page scroll ' + document.documentElement.scrollWidth + ' > ' + window.innerWidth);
  const boxes = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t; (t = w.nextNode());) {
    const txt = t.nodeValue.trim(); if (!txt) continue;
    const e = t.parentElement; if (!e || /^(SCRIPT|STYLE|NOSCRIPT|OPTION|TEXTAREA)$/.test(e.tagName) || !visible(e)) continue;
    const r = document.createRange(); r.selectNodeContents(t); const b = r.getBoundingClientRect();
    if (b.width < 2 || b.height < 2 || b.bottom < 0 || b.top > innerHeight || b.right < 0 || b.left > innerWidth) continue;
    const cs = getComputedStyle(e);
    if (e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0 && cs.textOverflow !== 'ellipsis' && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll' && cs.display !== 'inline' && cs.overflowX === 'hidden') out.push('clipped text ' + path(e));
    boxes.push({ e, b });
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], c = boxes[j];
    if (a.e === c.e || a.e.contains(c.e) || c.e.contains(a.e)) continue;
    const ox = Math.min(a.b.right, c.b.right) - Math.max(a.b.left, c.b.left), oy = Math.min(a.b.bottom, c.b.bottom) - Math.max(a.b.top, c.b.top);
    if (ox > 3 && oy > 3) out.push('overlap ' + path(a.e) + ' / ' + path(c.e));
  }
  return out.slice(0, 12);
});
module.exports.checkContrast = (scope, sel) => scope.evaluate((sel) => {
  const lum = (c) => { const v = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const parse = (s) => { const m = s.match(/[\d.]+/g); return m ? m.map(Number) : [0, 0, 0, 0]; };
  const bgOf = (e) => { for (let n = e; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c[3] === undefined || c[3] > 0.5) return c.slice(0, 3); } return [255, 255, 255]; };
  const out = [];
  document.querySelectorAll(sel).forEach((root) => {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let t; (t = w.nextNode());) {
      if (!t.nodeValue.trim()) continue; const e = t.parentElement; const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const fg = parse(cs.color).slice(0, 3), a = lum(fg), b = lum(bgOf(e)), r = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const big = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && +cs.fontWeight >= 700);
      if (r < (big ? 3 : 4.5)) out.push(e.className + ' "' + t.nodeValue.trim().slice(0, 24) + '" ' + r.toFixed(2));
    }
  });
  return out.slice(0, 12);
}, sel);
