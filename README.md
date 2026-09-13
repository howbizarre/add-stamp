# Image Watermarking App

![Screenshot](./app/assets/img/screenshot.png)

A Nuxt 4 application that allows users to apply watermarks to images using WebAssembly (WASM) for high-performance image processing.

> **📚 WASM Development Guide**: For detailed information about the WebAssembly module, Rust implementation, and build processes, see [README-WASM.md](README-WASM.md).

## Features

- 🖼️ Upload multiple images for batch processing
- 🏷️ Select PNG stamp/watermark images with intelligent positioning
- 📝 Automatic filename text watermark with custom fonts
- ⚡ High-performance image processing using Rust/WASM
- 📁 Save processed images to a specific directory (File System Access API)
- 🎨 Support for JPG and WebP output formats
- 🔧 Configurable quality settings
- 🎯 Smart watermark scaling with "contain" behavior and padding
- 🔤 Adaptive font sizing for consistent text appearance
- 🎚️ Adjustable stamp opacity (1-100%) with real-time preview
- 💾 Automatic fallback to downloads if directory access not supported

## Quick Start

For those who want to get up and running immediately:

```bash
# 1. Clone and navigate to the project
git clone https://github.com/howbizarre/add-stamp.git
cd add-stamp

# 2. Install all dependencies
npm install

# 3. Build WASM module and start development server
npm run dev:wasm
```

Then visit [http://localhost:5654](http://localhost:5654) to use the application.

**Note:** You need Rust and wasm-pack installed (see Prerequisites section below for detailed installation instructions).

## Prerequisites

Before you begin, ensure you have the following installed on your system:

- **Node.js** (version 18 or higher) - [Download Node.js](https://nodejs.org/)
- **Rust** - [Install Rust](https://rustup.rs/)
- **wasm-pack** - Install via: `cargo install wasm-pack`

### Installing Prerequisites

1. **Install Node.js:**
   - Download and install from [nodejs.org](https://nodejs.org/)
   - Verify installation: `node --version` and `npm --version`

2. **Install Rust:**
   ```bash
   # Windows (PowerShell)
   Invoke-WebRequest -Uri "https://win.rustup.rs" -OutFile "rustup-init.exe"
   .\rustup-init.exe
   
   # macOS/Linux
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```

3. **Install wasm-pack:**
   ```bash
   cargo install wasm-pack
   ```

4. **Add WebAssembly target:**
   ```bash
   rustup target add wasm32-unknown-unknown
   ```

## Setup

Follow these steps to set up the project on your local environment:

### 1. Clone the Repository

```bash
git clone https://github.com/howbizarre/add-stamp.git
cd add-stamp
```

### 2. Install Dependencies

```bash
# npm
npm install

# pnpm
pnpm install

# yarn
yarn install

# bun
bun install
```

### 3. Build the WASM Module

The application uses a Rust/WASM module for image processing. You need to build it first:

```bash
# Build the WASM module (compiles and publishes the artifact automatically)
npm run build:wasm

# Republish an existing wasm/pkg/ without recompiling
npm run copy:wasm
```

### 4. Verify WASM Files

The build publishes to a version-stamped directory, so make sure these exist in
`public/wasm/v<version>/`, where `<version>` is the `version` field of `package.json`:

- `image_stamper.js`
- `image_stamper_bg.wasm`

The build script fails loudly if either is missing or empty, so a successful
`npm run build:wasm` is itself the check. See [README-WASM.md](README-WASM.md) for why the
directory is versioned and when to bump it.

## Development Server

Start the development server on `http://localhost:5654`:

```bash
# npm
npm run dev

# pnpm
pnpm dev

# yarn
yarn dev

# bun
bun run dev
```

The application will be available at [http://localhost:5654](http://localhost:5654)

## Usage

1. **Select Images**: Click "Upload Images" to select multiple images you want to watermark
2. **Choose Stamp**: Click "Choose PNG Stamp" to select a PNG image that will be used as a watermark
3. **Adjust Opacity**: Use the opacity slider (1-100%) to control stamp transparency - default is 75%
4. **Add Stamp**: Click "Add Stamp" to process all images with the selected watermark and opacity
5. **Save Results**: Click "Save to Directory" to save all processed images to a folder of your choice

### Watermarking Features

- **Image Watermark**: PNG stamps are automatically scaled using "contain" behavior with 10px padding from image edges
- **Adjustable Opacity**: Control stamp transparency from 1% (nearly invisible) to 100% (fully opaque)
- **Text Watermark**: Each image automatically gets a text watermark with its filename
- **Smart Positioning**: Watermarks are intelligently positioned to avoid overlapping with image content
- **Adaptive Text**: Font size automatically adapts based on image dimensions for consistent appearance across all images
- **Transparency**: Text watermarks use 50% opacity for subtle branding

### Supported Features

- **Input Formats**: JPG, PNG, WebP, and other common image formats
- **Output Formats**: JPG (default) or WebP
- **Watermark**: PNG images with transparency support
- **Opacity Control**: Adjustable stamp opacity from 0% to 100% (default: 50%)
- **Text Rendering**: Embedded Ubuntu-M subset with Cyrillic coverage and real kerning
- **Color Customization**: Text watermarks default to #7d7d7d at 50% opacity, and every
  colour, size and margin is a settable option
- **Quality Control**: Configurable compression quality (default: 75%, JPEG only)
- **EXIF Orientation**: Portrait frames are uprighted before stamping
- **Size Limits**: Oversized images are refused from their header, so one bad file cannot
  take down the rest of the batch
- **Batch Processing**: Process multiple images at once
- **Directory Saving**: Save all processed images to a specific folder

## Development Workflow

### Making Changes to WASM Code

When you modify the Rust code in the `wasm/` directory, you need to rebuild the WASM module:

```bash
# Stop the development server (Ctrl+C)
# Then rebuild WASM and restart
npm run build:wasm
npm run dev
```

Or use the convenient script that does both:

```bash
# This will rebuild WASM and start the dev server
npm run dev:wasm
```

### Making Changes to Vue/TypeScript Code

Changes to files in the `app/` directory will be automatically reloaded by the development server.

## Advanced Configuration

### Watermark Settings

The application provides several advanced watermarking options:

Every one of these is a field of `StampOptions` with a default, not a hard-coded constant.
The full table is in [README-WASM.md](README-WASM.md#options).

- **Image Watermark Scaling**: "contain" behaviour, fitting the stamp within the image with
  10px padding by default (`stampPadding`)
- **Stamp Opacity Control**: Adjustable transparency from 0% to 100% (default: 50%)
- **Text Watermark Font**: Embedded Ubuntu-M subset, so the caption renders identically
  whatever fonts the client has
- **Adaptive Font Sizing**: 2.2% of the frame's shorter side, clamped to 16-96px
  (`textSizeRatio`, `textSizeMin`, `textSizeMax`)
- **Text Colour**: #7d7d7d at 50% by default (`textColor`), alpha honoured
- **Positioning**: Centred along the bottom edge, with a margin proportional to the caption

### Customizing Stamp Opacity

The stamp opacity can be adjusted in real-time:

1. Select a PNG stamp file
2. Use the opacity input field (1-100%) next to the "Remove Stamp" button
3. Default value is 75% for optimal visibility without overwhelming the image
4. Lower values (1-50%) create subtle watermarks
5. Higher values (75-100%) create more prominent branding

### Customizing Fonts

To use a different font for text watermarks:

1. Add your TTF file to `wasm/src/`
2. Point `FONT_DATA` in `wasm/src/lib.rs` at it:
   ```rust
   static FONT_DATA: &[u8] = include_bytes!("./YourFont.ttf");
   ```
3. Rebuild the WASM module: `npm run build:wasm`

Font data is incompressible and dominates the binary, so subset it to the characters your
filenames actually use — the doc comment on `FONT_DATA` carries the `pyftsubset` command used
for the shipped font, including the `--legacy-kern` flag that keeps kerning working.

### Performance Optimization

- **WASM Processing**: Near-native performance for image operations using Rust
- **Batch Processing**: Reduces overhead for multiple images with progress tracking
- **Adaptive Font Sizing**: Ensures consistent rendering across different image sizes
- **Scaled-stamp Cache**: Frames of the same size reuse one resized stamp, so the resize runs
  once per batch instead of once per photo
- **Memory-efficient Handling**: JPEG encoding builds RGB directly rather than allocating a
  full RGBA copy first
- **Smart Caching**: WASM module loads once and is reused for all operations

## Available Scripts

### WASM Development

```bash
# Build WASM module
npm run build:wasm

# Clean WASM build artifacts
npm run clean:wasm

# Copy WASM files to public directory
npm run copy:wasm

# Build WASM and start development server
npm run dev:wasm
```

### Nuxt Application

```bash
# Development
npm run dev

# Build for production
npm run build

# Preview production build (uses Cloudflare Wrangler)
npm run preview

# Generate static site
npm run generate

# Deploy to Cloudflare (if configured)
npm run deploy
```

## Production

Build the application for production:

```bash
# 1. First, build the WASM module
npm run build:wasm

# 2. Then build the Nuxt application
npm run build
```

Locally preview production build:

```bash
npm run preview
```

## Deployment

### Cloudflare Pages/Workers

This project is configured for deployment on Cloudflare using Wrangler. The WASM files will be automatically included in the build.

```bash
# Build and deploy to Cloudflare
npm run deploy

# Or manually:
npm run build
npx wrangler --cwd .output/ deploy
```

**Important Notes for Cloudflare Deployment:**

1. **WASM Files**: The WASM module files are automatically copied to `.output/public/wasm/` during the build process
2. **Headers**: Proper content-type headers are configured for WASM files in `nuxt.config.ts`
3. **Browser Requirements**: Modern browsers are required for WASM support
4. **File System Access API**: Will fallback to downloads on Cloudflare (no server-side file writing)

### Verifying Deployment

After deployment, verify that WASM files are accessible:
- `https://your-domain.com/wasm/image_stamper.js`
- `https://your-domain.com/wasm/image_stamper_bg.wasm`

## Troubleshooting

### WASM Build Issues

If you encounter issues building the WASM module:

1. **Ensure Rust is installed correctly:**
   ```bash
   rustc --version
   cargo --version
   ```

2. **Ensure wasm-pack is installed:**
   ```bash
   wasm-pack --version
   ```

3. **Ensure WebAssembly target is added:**
   ```bash
   rustup target add wasm32-unknown-unknown
   ```

4. **Clean and rebuild:**
   ```bash
   npm run clean:wasm
   npm run build:wasm
   ```

### Font and Text Rendering Issues

If text watermarks are not appearing correctly:

1. **Verify the font file exists:**
   - Check that `Ubuntu-M-subset.ttf` is present in `wasm/src/`
   - A corrupt or missing font fails the build, not the run: it is embedded at compile time

2. **Characters render as empty boxes:**
   - The embedded font is a subset. A character outside Latin-1, Latin Extended-A/B or
     Cyrillic has no glyph and renders as `.notdef`
   - Widen the ranges and regenerate — see the `FONT_DATA` doc comment in `wasm/src/lib.rs`

3. **Text not visible:**
   - Check that the caption colour contrasts with the image background (`textColor`)
   - A fully transparent `textColor` draws nothing at all
   - `npm test` covers the subset's alphabet coverage and the alpha handling

### Opacity and Transparency Issues

If stamp opacity is not working as expected:

1. **Opacity not applying:**
   - Verify the WASM module is properly compiled with the latest changes
   - Check browser console for JavaScript errors
   - Ensure the opacity value is between 0 and 100

2. **Stamp too transparent or too opaque:**
   - Adjust the opacity slider (0-100%)
   - Remember: 0% = invisible, 100% = fully opaque
   - The default 50% provides a good balance for most images

3. **WASM method errors:**
   - If you see "applyStamp is not a function", the browser is running a stale artifact
   - Rebuild: `npm run build:wasm`, then clear the browser cache and reload
   - Check that `version` in `package.json` matches the directory under `public/wasm/`

### Image Processing Issues

If watermarking fails or produces unexpected results:

1. **Supported image formats:**
   - Input: JPG, PNG, WebP, BMP, TIFF
   - Output: JPG, WebP
   - Watermark stamps: PNG with transparency

2. **Memory limitations:**
   - Very large images (>50MB) may cause WASM memory issues
   - Consider resizing extremely large images before processing

3. **Watermark positioning:**
   - Stamps use "contain" scaling with 10px padding
   - Text watermarks adapt font size based on image dimensions

### Development Server Issues

If the development server fails to start:

1. **Clear node_modules and reinstall:**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

2. **Check Node.js version:**
   ```bash
   node --version  # Should be 18 or higher
   ```

### Browser Compatibility

- **File System Access API**: Requires a modern browser (Chrome 86+, Edge 86+)
- **WebAssembly**: Supported in all modern browsers
- **Fallback**: The app will download files individually if File System Access API is not supported

## Project Structure

```
add-stamp/
├── app/
│   ├── assets/
│   │   ├── css/             # Styling files
│   │   └── fonts/           # Custom fonts (Ubuntu-M.ttf)
│   ├── components/          # Vue components
│   │   ├── ImageGallery.vue
│   │   ├── ImageUploader.vue
│   │   └── StampPicker.vue
│   ├── composables/         # Composable functions
│   │   └── useImageStamping.ts
│   └── app.vue             # Main application component
├── wasm/                   # Rust/WASM source code — see README-WASM.md
│   ├── src/
│   │   ├── lib.rs          # Options, pipeline, encoding, size limits
│   │   ├── blend.rs        # Alpha compositing
│   │   ├── error.rs        # StampError, converted to JsError at the boundary
│   │   ├── layout.rs       # Pure geometry: contain-scale, centring
│   │   ├── orientation.rs  # EXIF orientation
│   │   ├── text.rs         # Glyph rasterization
│   │   └── Ubuntu-M-subset.ttf
│   ├── tests/              # End-to-end pipeline tests
│   ├── examples/bench.rs   # Hot-path timings
│   ├── Cargo.toml          # Rust dependencies (image, ab_glyph, kamadak-exif)
│   └── pkg/                # Generated WASM files
├── scripts/
│   └── build-wasm.mjs      # Builds the crate and publishes the artifact
├── public/
│   └── wasm/v<version>/    # Deployed WASM files
└── package.json            # Node.js dependencies and scripts
```

## Technology Stack

- **Frontend**: Nuxt 4, Vue 3, TypeScript, Tailwind CSS
- **Image Processing**: Rust, WebAssembly (WASM)
- **Text Rendering**: ab_glyph, with per-glyph advances and kerning
- **Image Libraries**: image crate (png, jpeg, webp only), kamadak-exif for orientation
- **Font Assets**: Embedded Ubuntu-M subset with adaptive sizing
- **Build Tools**: Vite, wasm-pack
- **File Handling**: File System Access API with download fallback

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Build and test: `npm test && npm run build:wasm && npm run dev`
5. Commit your changes: `git commit -m 'Add your feature'`
6. Push to the branch: `git push origin feature/your-feature`
7. Submit a pull request

## License

This project is licensed under the MIT License. See the [LICENSE.md](LICENSE.md) file for details.

### Third-Party Components

- **Ubuntu Font**: Licensed under the Ubuntu Font Licence — see
  [wasm/src/FONT-LICENSE.md](wasm/src/FONT-LICENSE.md)
- **Rust Dependencies**: Various licenses (MIT/Apache-2.0) - see Cargo.toml
- **JavaScript Dependencies**: Various licenses - see package.json

## Links

- [Nuxt Documentation](https://nuxt.com/docs/getting-started/introduction)
- [Rust Documentation](https://doc.rust-lang.org/)
- [wasm-pack Documentation](https://rustwasm.github.io/wasm-pack/)
- [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)
