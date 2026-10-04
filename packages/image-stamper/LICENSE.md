# MIT License

Copyright (c) 2025 Add Stamp Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Third-party components

The WebAssembly binary in this package is compiled from Rust and embeds a font. Their
licences are separate from the MIT licence above and ship with the package:

- **Ubuntu font.** The binary embeds *Ubuntu Medium derivative Image Stamper*, a subset of
  Ubuntu Medium (Dalton Maag Ltd for Canonical Ltd) renamed as its licence requires, used
  only to rasterize the caption. Copyright 2011 Canonical Ltd, licensed under the Ubuntu
  Font Licence 1.0. The notice and the full licence text are in
  [FONT-LICENSE.md](./FONT-LICENSE.md).
- **Rust crates.** The 32 crates linked into the binary, each with the licence it is used
  under and that licence's text, are listed in
  [THIRD-PARTY-LICENSES.md](./THIRD-PARTY-LICENSES.md), generated from the repository's
  `wasm/Cargo.lock`.
