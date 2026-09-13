# Embedded font

`Ubuntu-M-subset.ttf` is a **subset of Ubuntu Medium**, produced from the upstream
`Ubuntu-M.ttf` (Version 0.80, Dalton Maag Ltd for Canonical Ltd).

```
Copyright 2011 Canonical Ltd. Licensed under the Ubuntu Font Licence 1.0
Ubuntu and Canonical are registered trademarks of Canonical Ltd.
```

The full licence text is at <https://ubuntu.com/legal/font-licence>.

## What was changed

The file is a derivative: character coverage was reduced and several tables were removed to
cut the WebAssembly artifact by ~264 KB. Nothing about the retained glyph outlines, metrics
or kerning values was altered — the subsetter copies them verbatim.

The `name` table is preserved in full (`--name-IDs='*'`), so the copyright and trademark
notices above travel with the file itself.

The exact regeneration command lives next to the `include_bytes!` in `lib.rs` — keep the two
in step if the ranges ever change. Regenerating needs the upstream `Ubuntu-M.ttf`, which is no
longer in this repository; fetch it from <https://design.ubuntu.com/font>.

## Note on UFL clause 4

The Ubuntu Font Licence requires modified versions to be renamed when distributed. This file
is not distributed as a font: it is linked into a WebAssembly binary and used only to
rasterize a watermark, and the repository is private. Should the font ever be shipped as a
font — or the repository published — rename the face in the `name` table before doing so.

This note records the reasoning, not legal advice.
