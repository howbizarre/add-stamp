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

## Third-Party Licenses

This project includes the following third-party software:

### Font: Ubuntu Medium
- **License**: Ubuntu Font Licence 1.0, see [wasm/src/FONT-LICENSE.md](wasm/src/FONT-LICENSE.md)
- **Source**: [Ubuntu Font Family](https://design.ubuntu.com/font/)
- **Usage**: `app/assets/fonts/Ubuntu-M.ttf` is the full face; a subset of it is embedded in the
  WebAssembly binary to draw the caption

### Rust Dependencies
Every crate compiled into the WebAssembly binary, with the licence it is used under and that
licence's text, is listed in
[packages/image-stamper/THIRD-PARTY-LICENSES.md](packages/image-stamper/THIRD-PARTY-LICENSES.md),
generated from `wasm/Cargo.lock`. The direct dependencies are:
- **image**: MIT OR Apache-2.0
- **ab_glyph**: Apache-2.0
- **kamadak-exif**: BSD-2-Clause
- **wasm-bindgen**: MIT OR Apache-2.0
- **console_error_panic_hook**: MIT OR Apache-2.0

### JavaScript/TypeScript Dependencies
Please refer to `package.json` for a complete list of dependencies and their respective licenses.

## Contributing

By contributing to this project, you agree that your contributions will be licensed under the MIT License.
