# Image Watermarking App

A Nuxt 3 application that allows users to apply watermarks to images using WebAssembly (WASM) for high-performance image processing.

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
# Build the WASM module (builds and copies files automatically)
npm run build:wasm

# Alternative: build and copy separately
cd wasm
wasm-pack build --target web --out-dir pkg --out-name image_stamper
cd ..
npm run copy:wasm
```

### 4. Verify WASM Files

Make sure the following files exist in `public/wasm/`:
- `image_stamper.js`
- `image_stamper_bg.wasm`
- `image_stamper.d.ts`
- `image_stamper_bg.wasm.d.ts`

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
- **Opacity Control**: Adjustable stamp opacity from 1% to 100% (default: 75%)
- **Text Rendering**: Custom Ubuntu-M.ttf font with adaptive sizing
- **Color Customization**: Text watermarks use #7d7d7d color with 50% opacity
- **Quality Control**: Configurable compression quality (default: 75%)
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

- **Image Watermark Scaling**: Uses "contain" behavior to fit stamps within images with 10px padding
- **Stamp Opacity Control**: Adjustable transparency from 1% to 100% (default: 75%)
- **Text Watermark Font**: Custom Ubuntu-M.ttf font for professional appearance  
- **Adaptive Font Sizing**: Font size automatically calculates as 4% of the minimum image dimension (min: 16px, max: 48px)
- **Text Opacity**: 50% transparency for subtle text watermarks
- **Text Color**: #7d7d7d (medium gray) for optimal contrast
- **Positioning**: Smart placement to avoid overlapping with existing content

### Customizing Stamp Opacity

The stamp opacity can be adjusted in real-time:

1. Select a PNG stamp file
2. Use the opacity input field (1-100%) next to the "Remove Stamp" button
3. Default value is 75% for optimal visibility without overwhelming the image
4. Lower values (1-50%) create subtle watermarks
5. Higher values (75-100%) create more prominent branding

### Customizing Fonts

To use a different font for text watermarks:

1. Add your TTF font file to the `wasm/` directory
2. Update the font loading in `wasm/src/lib.rs`:
   ```rust
   let font_data = include_bytes!("../YourFont.ttf");
   ```
3. Rebuild the WASM module: `npm run build:wasm`

### Performance Optimization

- **WASM Processing**: Near-native performance for image operations using Rust
- **Batch Processing**: Reduces overhead for multiple images with progress tracking
- **Adaptive Font Sizing**: Ensures consistent rendering across different image sizes
- **Real-time Opacity Control**: Instant feedback without reprocessing
- **Memory-efficient Handling**: Optimized for large files and batch operations
- **Smart Caching**: WASM module loads once and reuses for all operations

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

1. **Verify font file exists:**
   - Check that `Ubuntu-M.ttf` is present in the `wasm/` directory
   - Ensure the font file is not corrupted

2. **Font loading errors:**
   ```bash
   # Check WASM build output for font-related errors
   cd wasm
   wasm-pack build --target web --out-dir pkg --out-name image_stamper
   ```

3. **Text not visible:**
   - Verify image dimensions are sufficient (minimum 16px font size)
   - Check that text color contrasts with image background
   - Ensure opacity settings are correct (50% transparency)

### Opacity and Transparency Issues

If stamp opacity is not working as expected:

1. **Opacity not applying:**
   - Verify the WASM module is properly compiled with the latest changes
   - Check browser console for JavaScript errors
   - Ensure opacity value is between 1-100

2. **Stamp too transparent or too opaque:**
   - Adjust the opacity slider (1-100%)
   - Remember: 1% = nearly invisible, 100% = fully opaque
   - Default 75% provides good balance for most images

3. **WASM method errors:**
   - If you see "apply_stamp_with_options_text_and_opacity is not a function"
   - Rebuild WASM module: `npm run build:wasm`
   - Clear browser cache and reload the page

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
├── wasm/                   # Rust/WASM source code
│   ├── src/
│   │   └── lib.rs          # Image processing logic with text rendering
│   ├── Ubuntu-M.ttf        # Custom font for text watermarks
│   ├── Cargo.toml          # Rust dependencies (image, imageproc, rusttype)
│   └── pkg/                # Generated WASM files
├── public/
│   └── wasm/               # Deployed WASM files
└── package.json            # Node.js dependencies and scripts
```

## Technology Stack

- **Frontend**: Nuxt 3, Vue 3, TypeScript, Tailwind CSS
- **Image Processing**: Rust, WebAssembly (WASM)
- **Text Rendering**: rusttype crate with TrueType font support
- **Image Libraries**: image crate, imageproc for advanced operations
- **Font Assets**: Custom Ubuntu-M.ttf font with adaptive sizing
- **Build Tools**: Vite, wasm-pack
- **File Handling**: File System Access API with download fallback

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Build and test: `npm run build:wasm && npm run dev`
5. Commit your changes: `git commit -m 'Add your feature'`
6. Push to the branch: `git push origin feature/your-feature`
7. Submit a pull request

## License

This project is licensed under the MIT License. See the [LICENSE.md](LICENSE.md) file for details.

### Third-Party Components

- **Ubuntu-M.ttf Font**: Licensed under Ubuntu Font License (UFL)
- **Rust Dependencies**: Various licenses (MIT/Apache-2.0) - see Cargo.toml
- **JavaScript Dependencies**: Various licenses - see package.json

## Links

- [Nuxt Documentation](https://nuxt.com/docs/getting-started/introduction)
- [Rust Documentation](https://doc.rust-lang.org/)
- [wasm-pack Documentation](https://rustwasm.github.io/wasm-pack/)
- [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)
