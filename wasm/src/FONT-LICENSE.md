# Embedded font

`Ubuntu-M-subset.ttf` is **Ubuntu Medium derivative Image Stamper**: a subset of Ubuntu
Medium (`Ubuntu-M.ttf`, version 0.80, Dalton Maag Ltd for Canonical Ltd), renamed as its
licence requires. It is embedded in the WebAssembly binary with `include_bytes!` and used
only to rasterize the caption.

```
Copyright 2011 Canonical Ltd. Licensed under the Ubuntu Font Licence 1.0
Ubuntu and Canonical are registered trademarks of Canonical Ltd.
```

The full licence text is at <https://ubuntu.com/legal/font-licence>. The npm package ships
it as `packages/image-stamper/FONT-LICENSE.md`, next to the binary.

## What was changed

The file is a derivative of the upstream face, produced by `scripts/font-subset.py`:

- **Coverage** was reduced to Latin-1, Latin Extended-A/B, Cyrillic, the general-punctuation
  block (dashes, curly quotes, bullet, ellipsis) and the euro sign. A character outside that
  set is not drawn.
- **Tables** GPOS, GSUB, DSIG, VDMX, LTSH and hdmx were removed, and hinting was stripped.
  `ab_glyph` reads none of them. The legacy `kern` table is kept, because that is the one
  `ab_glyph` does read; `pyftsubset` drops it by default.
- **Outlines, metrics and kerning values are unchanged.** The subsetter copies them verbatim,
  so the caption renders exactly as the upstream face would.
- **The `name` table was rewritten** for the records that carry the face's name: family
  (IDs 1 and 16) is now *Ubuntu derivative Image Stamper*, full name (ID 4) *Ubuntu Medium
  derivative Image Stamper*, PostScript name (ID 6) `UbuntuMedium-derivative-ImageStamper`,
  unique identifier (ID 3) accordingly. The copyright (0), version (5), trademark (7),
  manufacturer (8), designer (9), description (10) and URL (11, 12) records are the
  upstream ones, verbatim. A licence description (13) and the licence URL (14) were added.

Together the subset cuts about 264 KB from the binary, which matters because font data is
incompressible and passes through `wasm-opt` untouched.

## Why it is renamed

Under the Ubuntu Font Licence 1.0, a "Modified Version" is "any derivative made by adding
to, deleting, or substituting, in part or in whole, any of the components of the Original
Version, by changing formats or by porting the Font Software to a new environment". A
subset embedded in a WebAssembly binary is one on every count. It is not "Substantially
Changed", since users could not tell its glyphs from the original's, so condition 2(c)
applies: the Modified Version must keep the original name and add "derivative X", where X
names the new work. Hence *Ubuntu Medium derivative Image Stamper*.

Condition 1 requires every copy to carry the copyright notice and the licence. The notice
travels inside the binary in the font's own `name` table, and the licence text ships as a
file beside the binary in the npm package and at the URL above. The licence grants no
trademark rights; "Ubuntu" appears in the derivative's name only in the form condition 2(c)
prescribes.

An earlier version of this note argued that the file was not distributed as a font and that
the repository was private. Neither holds: the subset is a tracked file in a public
repository, and the binary is published on npm.

## Regenerating

From the repository root, with Python 3 available:

```bash
pip install fonttools
python scripts/font-subset.py
```

The script reads `app/assets/fonts/Ubuntu-M.ttf`, the full upstream face kept in the
repository for this purpose, and writes this file. It subsets and renames in one go, prints
the resulting `name` table, and refuses to finish if any record still carries the original
name. Afterwards rebuild the wasm and run the Rust tests, which draw text with this file.
The Unicode ranges and the dropped tables are also described in the doc comment on
`FONT_DATA` in `lib.rs`; keep the two in step.
