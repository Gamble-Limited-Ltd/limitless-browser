#!/usr/bin/env python3
"""Generate theme/themes.css from docs/DESIGN.md sections 1 and 2. Edit the tables here, rerun, commit both."""
import pathlib
OUT = pathlib.Path(__file__).resolve().parent.parent / "theme" / "themes.css"
# id: {mode: (bg, surf, fg, mut, line, acc, acc2, on, acc3 or None)}
T = {
 "luxury": {"dark": ("#070a10","#0e131c","#eae6dc","#8d93a0","#232a38","#BDFFFF","#4DA6FF","#07101a",None),
            "light":("#eeece6","#f8f6f1","#11161f","#666b75","#cfcbc0","#1a5fae","#4DA6FF","#ffffff",None)},
 "fancy":  {"dark": ("#0e1230","#171c44","#eef2ff","#9aa6d6","#2c3470","#4DA6FF","#BDFFFF","#05112a","#b69cff"),
            "light":("#f3f6ff","#ffffff","#1a1f4a","#5d6699","#d6dcf5","#2171dc","#BDFFFF","#ffffff","#8a63ee")},
 "minimal":{"dark": ("#0c0d0f","#141517","#f4f4f5","#8a8d93","#232528","#4DA6FF","#BDFFFF","#04101c",None),
            "light":("#fcfcfd","#f3f4f6","#101114","#6b6f76","#e4e6ea","#1e74d9","#BDFFFF","#ffffff",None)},
 "soft":   {"dark": ("#1a2238","#232d49","#eaf1ff","#9fb0d0","#34405f","#8cc4ff","#BDFFFF","#10213c","#f4b8d8"),
            "light":("#f2f7ff","#ffffff","#2b3a55","#61718b","#dfe8f7","#4DA6FF","#BDFFFF","#12304f","#ffc9e1")},
 "retro":  {"dark": ("#0b1a2a","#10263c","#BDFFFF","#6fa4c2","#4DA6FF","#4DA6FF","#BDFFFF","#04121f","#ffcc66"),
            "light":("#e9eef2","#f8fbfd","#1d2433","#58627a","#1d2433","#2171dc","#BDFFFF","#ffffff","#ff8a5c")},
 "ledger": {"dark": ("#0b0912","#131020","#f0e8d0","#aaa18a","#3b3322","#c9a84c","#e2c87a","#0b0912","#1b1729"),
            "light":("#f0e8d0","#f7f2e2","#1b1626","#5c5545","#d3c79f","#7e6318","#6b520f","#f0e8d0","#e6dcbd")},
 "mono":   {"dark": ("#0d0d0d","#171717","#f2f2f2","#9a9a9a","#2e2e2e","#f2f2f2","#bdbdbd","#0d0d0d","#1f1f1f"),
            "light":("#f4f4f2","#ffffff","#141414","#6a6a6a","#d8d8d8","#141414","#555555","#ffffff","#ededeb")},
 "vault":  {"dark": ("#000000","#0b0912","#ffffff","#d7ceb4","#c9a84c","#e2c87a","#c9a84c","#000000","#0b0912")},
 # Paid themes (docs/1.0/design/picks-round3.md, values from Design Room III, rich gold). Cardinal: ink, silver. Prime: garnet, crplat. Executive: gilt, onyx. Dark only except silver.
 "ink":    {"dark": ("#060a14","#0c1323","#e6ecf7","#8793ab","#1c2740","#8cc0ff","#3f7fd6","#060a14","#16213b")},
 "silver": {"dark": ("#090b0f","#12151b","#e8ebef","#8f97a3","#262b34","#dfe3e9","#8f98a4","#090b0f","#1b1f27"),
            "light":("#eef0f3","#fafbfc","#14171c","#5c6370","#cfd3da","#3b4656","#566174","#ffffff","#e2e6ec")},
 "garnet": {"dark": ("#070405","#120a0d","#f0e6e6","#a48f93","#2d151b","#e2526a","#9e1b32","#070405","#2a1119")},
 "gilt":   {"dark": ("#0c0905","#17120a","#f4ecd8","#a89a7a","#33291a","#D4A531","#8A6A1C","#0c0905","#f6d77a")},
 "onyx":   {"dark": ("#000000","#070707","#f2ebdd","#8f887a","#1c1a16","#D4A531","#8A6A1C","#000000","#f6d77a")},
 "crplat": {"dark": ("#060607","#101013","#ebebef","#92939b","#26262c","#e2526a","#c9ced6","#060607","#f0c4cc")},
}
MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
PMONO = "'JetBrains Mono', " + MONO
GLLMONO = "'DM Mono', " + MONO
TYPE = {
 "luxury": ("'Bodoni Moda', 'Didot', Georgia, serif", "'Jost', system-ui, sans-serif", MONO, "0"),
 "fancy":  ("'Fraunces', Georgia, serif", "'Outfit', system-ui, sans-serif", MONO, "16px"),
 "minimal":("'Figtree', system-ui, sans-serif", "'Figtree', system-ui, sans-serif", MONO, "8px"),
 "soft":   ("'Quicksand', system-ui, sans-serif", "'Nunito', system-ui, sans-serif", MONO, "20px"),
 "retro":  ("'VT323', ui-monospace, monospace", "'IBM Plex Mono', ui-monospace, monospace", MONO, "0"),
 "ledger": ("'Playfair Display', Georgia, serif", "'DM Sans', system-ui, sans-serif", GLLMONO, "2px"),
 "mono":   ("'Playfair Display', Georgia, serif", "'DM Sans', system-ui, sans-serif", GLLMONO, "2px"),
 "vault":  ("'Playfair Display', Georgia, serif", "'DM Sans', system-ui, sans-serif", GLLMONO, "2px"),
 "ink": ("'Cormorant Garamond', Georgia, serif", "'Space Grotesk', system-ui, sans-serif", PMONO, "10px"),
 "silver": ("'Cormorant Garamond', Georgia, serif", "'Space Grotesk', system-ui, sans-serif", PMONO, "2px"),
 "garnet": ("'Cormorant Garamond', Georgia, serif", "'Space Grotesk', system-ui, sans-serif", PMONO, "2px"),
 "gilt": ("'Cormorant Garamond', Georgia, serif", "'Space Grotesk', system-ui, sans-serif", PMONO, "2px"),
 "onyx": ("'Cormorant Garamond', Georgia, serif", "'Space Grotesk', system-ui, sans-serif", PMONO, "0"),
 "crplat": ("'Cormorant Garamond', Georgia, serif", "'Space Grotesk', system-ui, sans-serif", PMONO, "2px"),
}
CONTRACT = [("--lb-ice","#BDFFFF"),("--lb-blue","#4DA6FF"),("--lb-silver","#dfe3e9"),("--lb-silver2","#9aa3ad"),("--lb-crim","#e2526a"),("--lb-crim2","#9e1b32"),
            ("--lb-gold","#D4A531"),("--lb-gold2","#8A6A1C"),("--lb-gold-hi","#f6d77a"),("--lb-ease","cubic-bezier(.2,.7,.2,1)"),("--lb-dur","220ms")] + \
           [("--lb-sp-%d" % i, "%dpx" % v) for i, v in enumerate((4,8,12,16,24,32,48,72), 1)]
# tier hooks: colour, deeper colour, text on the colour
TIERS = {"ordinal": ("var(--lb-ice)","var(--lb-blue)","#07101a"), "cardinal": ("var(--lb-silver)","var(--lb-silver2)","#0a0c10"),
         "prime": ("var(--lb-crim)","var(--lb-crim2)","#0d0709"), "executive": ("var(--lb-gold)","var(--lb-gold2)","#0b0904")}
def colors(v):
    bg,surf,fg,mut,line,acc,acc2,on,acc3 = v
    acc3 = acc3 or acc2
    return "".join("  --lb-%s: %s;\n" % (k, x) for k, x in
        (("bg",bg),("surf",surf),("fg",fg),("mut",mut),("line",line),("acc",acc),("acc2",acc2),("acc3",acc3),("on",on)))
o = ["/* Limitless Browser themes. Generated by scripts/gen-themes.py from docs/DESIGN.md sections 1 and 2.",
     "   Contract: <html data-lb-theme=\"<id>\" data-lb-mode=\"light|dark\">. No attribute = Luxury dark.",
     "   GLL theme colors (ledger, mono, vault) are copied from gll-shared tokens; see docs/SHARDS.md. */", ""]
# Type and shape: per theme, independent of mode. Default (no attribute) is luxury.
fd,fb,fm,r = TYPE["luxury"]
o.append(":root {\n  --lb-fd: %s;\n  --lb-fb: %s;\n  --lb-fm: %s;\n  --lb-r: %s;\n}\n" % (fd,fb,fm,r))
# 1.1 token contract (docs/1.1/DESIGN-GAPS.md section 1): theme independent, read by WP2 to WP5 as var(--lb-gold, #D4A531) etc.
o.append(":root {\n" + "".join("  %s: %s;\n" % kv for kv in CONTRACT) + "}\n")
for tier, (c, c2, on) in TIERS.items():
    o.append('.lb-tier-%s,\n[data-tier="%s"] {\n  --tc: %s;\n  --tc2: %s;\n  --tcon: %s;\n}\n' % (tier, tier, c, c2, on))
for tid,(fd,fb,fm,r) in TYPE.items():
    o.append(':root[data-lb-theme="%s"],\n.lb-scope[data-lb-theme="%s"] {\n  --lb-fd: %s;\n  --lb-fb: %s;\n  --lb-fm: %s;\n  --lb-r: %s;\n}\n' % (tid,tid,fd,fb,fm,r))
# Colors. Default = luxury dark.
o.append(":root,\n:root[data-lb-theme=\"luxury\"][data-lb-mode=\"dark\"],\n:root[data-lb-theme=\"luxury\"]:not([data-lb-mode]) {\n  color-scheme: dark;\n" + colors(T["luxury"]["dark"]) + "}\n")
for tid, modes in T.items():
    for mode in ("dark", "light"):
        if tid == "luxury" and mode == "dark":
            continue
        v = modes.get(mode) or modes["dark"]  # themes without a mode fall back to the mode they have
        sel = [':root[data-lb-theme="%s"][data-lb-mode="%s"]' % (tid, mode),
               '.lb-scope[data-lb-theme="%s"][data-lb-mode="%s"]' % (tid, mode)]  # .lb-scope: theme previews in settings
        if mode == "dark":
            sel.append(':root[data-lb-theme="%s"]:not([data-lb-mode])' % tid)
        scheme = "dark" if (mode == "dark" or mode not in modes) else "light"
        o.append(",\n".join(sel) + " {\n  color-scheme: %s;\n" % scheme + colors(v) + "}\n")
OUT.write_text("\n".join(o))
