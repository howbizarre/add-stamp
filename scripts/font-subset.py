#!/usr/bin/env python3
"""
Regenerates wasm/src/Ubuntu-M-subset.ttf from app/assets/fonts/Ubuntu-M.ttf.

Two steps, and the second is what the Ubuntu Font Licence 1.0 requires of the first
(see wasm/src/FONT-LICENSE.md):

  1. Subset. Keep Latin-1, Latin Extended-A/B, Cyrillic, the general-punctuation block and
     the euro sign, plus the legacy `kern` table, which is the one ab_glyph reads. Drop
     GPOS/GSUB (ab_glyph never consults them), hinting (it rasterizes without it) and the
     DSIG/VDMX/LTSH/hdmx metadata tables. The face goes from 341 KB to about 77 KB, which
     matters because font data is incompressible and passes through wasm-opt untouched.

  2. Rename. A subset is a "Modified Version" under the licence, and one that is not
     "Substantially Changed" (the outlines are identical), so condition 2(c) applies: the
     name must be the original name with "derivative X" appended. The face becomes
     "Ubuntu Medium derivative Image Stamper". The copyright, trademark, manufacturer,
     designer and description records are kept verbatim, and licence-description and
     licence-URL records are added.

Usage, from the repository root:

    pip install fonttools
    python scripts/font-subset.py

Then rebuild the wasm (`npm run build:wasm`, and `npm run build` in packages/image-stamper)
and run `npm test` (the Rust suite draws text with this file). The output is committed, so
regenerating is only needed when the ranges, the tables or the names change; keep those in
step with the doc comment on FONT_DATA in wasm/src/lib.rs.
"""

import sys
from pathlib import Path

try:
    from fontTools import subset
    from fontTools.ttLib import TTFont
except ImportError:
    sys.exit("fontTools is not installed. Run: pip install fonttools")

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "app" / "assets" / "fonts" / "Ubuntu-M.ttf"
TARGET = ROOT / "wasm" / "src" / "Ubuntu-M-subset.ttf"

# Latin-1, Latin Extended-A/B, Cyrillic, general punctuation (dashes, quotes, bullet,
# ellipsis), euro. Deliberately wider than strictly needed: a character outside the set is
# not drawn at all, so the cost of a missing glyph is a silent gap in the caption.
UNICODES = "U+0000-00FF,U+0100-024F,U+0400-04FF,U+2010-2027,U+20AC"

DROP_TABLES = ["DSIG", "VDMX", "LTSH", "hdmx", "GPOS", "GSUB"]

DERIVATIVE = "derivative Image Stamper"

# Windows/Unicode (platform 3, encoding 1, US English), the only platform the upstream face
# carries records for. IDs not listed here are kept exactly as upstream wrote them:
# 0 copyright, 5 version, 7 trademark, 8 manufacturer, 9 designer, 10 description,
# 11 vendor URL, 12 designer URL.
NAMES = {
    1: f"Ubuntu {DERIVATIVE}",  # family (legacy)
    2: "Medium",  # subfamily (legacy; upstream style-links Medium as the Bold of "Ubuntu Light")
    3: f"DaltonMaagLtd: Ubuntu Medium {DERIVATIVE} 0.80",  # unique identifier
    4: f"Ubuntu Medium {DERIVATIVE}",  # full name
    6: "UbuntuMedium-derivative-ImageStamper",  # PostScript name: no spaces allowed
    13: (
        "This Font Software is licensed under the Ubuntu Font Licence, Version 1.0. "
        "It is a Modified Version (a subset) of Ubuntu Medium, renamed as condition 2(c) "
        "of that licence requires. The licence text accompanies the software."
    ),
    14: "https://ubuntu.com/legal/font-licence",
    16: f"Ubuntu {DERIVATIVE}",  # typographic family
    17: "Medium",  # typographic subfamily
}


def describe(font):
    """The facts that must survive a regeneration unchanged."""
    kern_pairs = 0

    if "kern" in font:
        kern_pairs = sum(len(table.kernTable) for table in font["kern"].kernTables)

    return {
        "glyphs": font["maxp"].numGlyphs,
        "codepoints": len(font.getBestCmap()),
        "kern_pairs": kern_pairs,
        "tables": sorted(tag for tag in font.keys() if tag != "GlyphOrder"),
    }


def main():
    if not SOURCE.exists():
        sys.exit(f"upstream face not found at {SOURCE}")

    before = describe(TTFont(TARGET)) if TARGET.exists() else None

    options = subset.Options()
    options.layout_features = []  # --layout-features=''
    options.legacy_kern = True  # --legacy-kern
    options.hinting = False  # --no-hinting
    options.drop_tables += DROP_TABLES  # --drop-tables+=...
    options.name_IDs = ["*"]  # --name-IDs='*': keep the whole name table

    font = subset.load_font(str(SOURCE), options)
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=subset.parse_unicodes(UNICODES))
    subsetter.subset(font)

    name = font["name"]

    # Drop every existing record for the IDs being set, on any platform, so no copy of the
    # original name survives in a record this script did not write.
    name.names = [record for record in name.names if record.nameID not in NAMES]

    for name_id, value in NAMES.items():
        name.setName(value, name_id, 3, 1, 0x409)

    subset.save_font(font, str(TARGET), options)

    after = describe(TTFont(TARGET))
    size = TARGET.stat().st_size

    print(f"wrote {TARGET.relative_to(ROOT)} ({size} B, {size / 1024:.1f} KiB)")
    print(f"  glyphs {after['glyphs']}, codepoints {after['codepoints']}, kern pairs {after['kern_pairs']}")
    print(f"  tables {' '.join(after['tables'])}")

    if before is not None:
        for key in ("glyphs", "codepoints", "kern_pairs", "tables"):
            if before[key] != after[key]:
                print(f"  NOTE: {key} changed from {before[key]} to {after[key]}")

    print("  name table:")

    for record in sorted(name.names, key=lambda r: r.nameID):
        text = record.toUnicode()
        print(f"    {record.nameID:2d}: {text if len(text) <= 100 else text[:97] + '...'}")

    for forbidden in ("Ubuntu Medium 0.80", "Ubuntu-Medium"):
        for record in name.names:
            if record.toUnicode() == forbidden or record.toUnicode().endswith(forbidden):
                sys.exit(f"a record still carries the original name: {forbidden!r}")


if __name__ == "__main__":
    main()
