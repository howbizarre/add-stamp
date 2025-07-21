# PSN Web Galleries - Image Watermarking App

A Nuxt 3 application that allows users to apply watermarks to images using WebAssembly (WASM) for high-performance image processing.

## Features

- 🖼️ Upload multiple images for batch processing
- 🏷️ Select PNG stamp/watermark images
- ⚡ High-performance image processing using Rust/WASM
- 📁 Save processed images to a specific directory (File System Access API)
- 🎨 Support for JPG and WebP output formats
- 🔧 Configurable quality settings
- 💾 Automatic fallback to downloads if directory access not supported

## Quick Start

For those who want to get up and running immediately:

```bash
# 1. Clone and navigate to the project
git clone https://github.com/howbizarre/psn-web-galleries.git
cd psn-web-galleries

# 2. Install all dependencies
npm install

# 3. Build WASM module and start development server
npm run dev:wasm
```

Then visit [http://localhost:5533](http://localhost:5533) to use the application.

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
git clone https://github.com/howbizarre/psn-web-galleries.git
cd psn-web-galleries
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

Start the development server on `http://localhost:5533`:

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

The application will be available at [http://localhost:5533](http://localhost:5533)

## Usage

1. **Select Images**: Click "Upload Images" to select multiple images you want to watermark
2. **Choose Stamp**: Click "Choose PNG Stamp" to select a PNG image that will be used as a watermark
3. **Add Stamp**: Click "Add Stamp" to process all images with the selected watermark
4. **Save Results**: Click "Save to Directory" to save all processed images to a folder of your choice

### Supported Features

- **Input Formats**: JPG, PNG, WebP, and other common image formats
- **Output Formats**: JPG (default) or WebP
- **Watermark**: PNG images with transparency support
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
psn-web-galleries/
├── app/
│   ├── components/          # Vue components
│   │   ├── ImageGallery.vue
│   │   ├── ImageUploader.vue
│   │   └── StampPicker.vue
│   ├── composables/         # Composable functions
│   │   └── useImageStamping.ts
│   └── app.vue             # Main application component
├── wasm/                   # Rust/WASM source code
│   ├── src/
│   │   └── lib.rs          # Image processing logic
│   ├── Cargo.toml          # Rust dependencies
│   └── pkg/                # Generated WASM files
├── public/
│   └── wasm/               # Deployed WASM files
└── package.json            # Node.js dependencies and scripts
```

## Technology Stack

- **Frontend**: Nuxt 3, Vue 3, TypeScript, Tailwind CSS
- **Image Processing**: Rust, WebAssembly (WASM)
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

This project is licensed under the MIT License.

## Links

- [Nuxt Documentation](https://nuxt.com/docs/getting-started/introduction)
- [Rust Documentation](https://doc.rust-lang.org/)
- [wasm-pack Documentation](https://rustwasm.github.io/wasm-pack/)
- [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)
