# WASM Image Processing Module

This document covers the WebAssembly (WASM) module implementation for high-performance image watermarking using Rust. The WASM module provides the core image processing capabilities for the Image Watermarking App.

## Overview

The WASM module is built with Rust and compiled to WebAssembly to provide near-native performance for image processing operations in the browser. It handles:

- **Image Loading**: Support for PNG, JPEG, and WebP formats
- **Watermark Processing**: PNG stamp application with transparency
- **Text Rendering**: Font-based text watermarks with custom fonts
- **Image Scaling**: Smart scaling algorithms with aspect ratio preservation
- **Export**: WebP output with configurable quality settings

## Rust Dependencies

The module uses several high-quality Rust crates for image processing:

```toml
[dependencies]
wasm-bindgen = "0.2"           # WebAssembly bindings
image = "0.24"                 # Core image processing
imageproc = "0.23"             # Advanced image operations
rusttype = "0.9"               # Font rendering
console_error_panic_hook = "0.1" # Error handling
web-sys = "0.3"                # Web API bindings
```

### Key Features

- **`image` crate**: Handles multiple image formats (PNG, JPEG, WebP)
- **`imageproc`**: Provides advanced drawing and text rendering
- **`rusttype`**: TrueType font rendering for text watermarks
- **`wasm-bindgen`**: Seamless Rust-JavaScript interoperability

## Prerequisites for WASM Development

### Required Tools

1. **Rust Toolchain** (stable version recommended)
   ```bash
   # Install Rust using rustup
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   source ~/.cargo/env
   ```

2. **wasm-pack** (WebAssembly build tool)
   ```bash
   # Install wasm-pack
   cargo install wasm-pack
   ```

3. **wasm32-unknown-unknown target**
   ```bash
   # Add WebAssembly target
   rustup target add wasm32-unknown-unknown
   ```

### Verifying Installation

```bash
# Check Rust version
rustc --version

# Check Cargo version  
cargo --version

# Check wasm-pack version
wasm-pack --version

# Verify WebAssembly target
rustup target list --installed | grep wasm32
```

## Building the WASM Module

### Quick Build Commands

```bash
# Build WASM module for web target
npm run build:wasm

# Clean previous build artifacts
npm run clean:wasm

# Copy built files to public directory
npm run copy:wasm
```

### Manual Build Process

```bash
# Navigate to WASM directory
cd wasm

# Build with wasm-pack (web target)
wasm-pack build --target web --out-dir pkg --out-name image_stamper

# Copy to public directory (Windows)
xcopy /Y /E pkg\* ..\public\wasm\

# Copy to public directory (Unix/Linux/macOS)
cp -r pkg/* ../public/wasm/
```

### Build Configuration

The `Cargo.toml` file is configured for WASM compilation:

```toml
[package]
name = "image-stamper"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]  # Dynamic library for WASM

[dependencies]
# Core WASM bindings
wasm-bindgen = "0.2"

# Image processing with optimized features
image = { 
    version = "0.24", 
    default-features = false, 
    features = ["png", "jpeg", "webp"] 
}

# Advanced image operations
imageproc = "0.23"

# Font rendering
rusttype = "0.9"

# Error handling
console_error_panic_hook = "0.1"

# Web APIs
web-sys = { version = "0.3", features = ["console", "File", "FileReader", "Blob"] }
```

## WASM Module Architecture

### Core Components

#### ImageStamper Struct
The main WASM interface provides methods for image processing:

```rust
#[wasm_bindgen]
pub struct ImageStamper {
    stamp_data: Vec<u8>,      // Cached stamp image data
    stamp_width: u32,         // Stamp dimensions
    stamp_height: u32,
}
```

#### Key Methods

1. **`new()`** - Initialize the ImageStamper instance
2. **`set_stamp(stamp_bytes: &[u8])`** - Load and cache watermark image
3. **`process_image(image_bytes: &[u8], opacity: f32)`** - Apply watermark to image
4. **`add_text_watermark(...)`** - Add text-based watermarks

### Processing Pipeline

1. **Input Validation**: Verify image format and dimensions
2. **Image Decoding**: Convert bytes to internal image representation
3. **Stamp Processing**: Scale and position watermark appropriately
4. **Composition**: Blend watermark with original image using opacity
5. **Export**: Encode result as WebP with optimal compression

### Performance Optimizations

- **Memory Pooling**: Reuse allocated buffers for batch processing
- **SIMD Operations**: Leverage vectorized instructions where available
- **Minimal Allocations**: Direct buffer manipulation to reduce GC pressure
- **Streaming**: Process large images in chunks to manage memory usage

## Integration with JavaScript

### Loading the WASM Module

```javascript
import init, { ImageStamper } from './wasm/image_stamper.js';

// Initialize WASM module
await init();

// Create processor instance
const stamper = new ImageStamper();
```

### Processing Images

```javascript
// Set watermark once
await stamper.set_stamp(stampImageBytes);

// Process multiple images
for (const imageFile of images) {
    const imageBytes = new Uint8Array(await imageFile.arrayBuffer());
    const result = stamper.process_image(imageBytes, 0.5); // 50% opacity
    // result is Uint8Array containing WebP data
}
```

## WASM Technical Implementation

### Image Processing Algorithms

#### Watermark Scaling Strategy
The module uses a "contain" scaling approach that:
- Calculates optimal scale to fit watermark within image bounds
- Maintains aspect ratio to prevent distortion
- Applies padding to ensure proper positioning
- Centers the watermark for balanced composition

#### Opacity Blending
```rust
// Alpha blending formula implementation
let alpha = stamp_alpha * opacity;
let inv_alpha = 1.0 - alpha;

result_pixel = (original_pixel * inv_alpha) + (stamp_pixel * alpha);
```

#### Memory Management
- **Stack Allocation**: Use stack memory for small buffers
- **Heap Optimization**: Minimize heap allocations in hot paths
- **Buffer Reuse**: Cache intermediate results for batch operations
- **Zero-Copy**: Direct memory access where possible

### Font System Integration

The module includes embedded Ubuntu font for consistent text rendering:

```rust
// Load embedded font data
const UBUNTU_FONT: &[u8] = include_bytes!("Ubuntu-M.ttf");

// Dynamic font sizing based on image dimensions
let font_size = (image_width.min(image_height) as f32 * 0.05).max(12.0);
```

### Error Handling

Comprehensive error handling for production use:

```rust
#[wasm_bindgen]
pub fn process_image(&self, image_bytes: &[u8], opacity: f32) -> Result<Vec<u8>, JsValue> {
    // Input validation
    if image_bytes.is_empty() {
        return Err(JsValue::from_str("Empty image data"));
    }
    
    if !(0.0..=1.0).contains(&opacity) {
        return Err(JsValue::from_str("Opacity must be between 0.0 and 1.0"));
    }
    
    // Processing with error propagation
    let img = image::load_from_memory(image_bytes)
        .map_err(|e| JsValue::from_str(&format!("Image decode error: {}", e)))?;
    
    // ... processing logic
}
```

## WASM Module File Structure

```
wasm/
├── Cargo.toml                 # Rust package configuration
├── Cargo.lock                 # Dependency lock file
├── Ubuntu-M.ttf              # Embedded font for text watermarks
├── src/
│   └── lib.rs                 # Main WASM module implementation
├── pkg/                       # Generated WASM build output
│   ├── image_stamper.js       # JavaScript bindings
│   ├── image_stamper.d.ts     # TypeScript definitions
│   ├── image_stamper_bg.wasm  # Compiled WebAssembly binary
│   ├── image_stamper_bg.wasm.d.ts  # WASM type definitions
│   └── package.json           # NPM package metadata
└── target/                    # Rust build artifacts
    ├── wasm32-unknown-unknown/  # WebAssembly target build
    └── debug/                   # Debug build artifacts
```

### Generated Files

After building, the following files are copied to `public/wasm/`:

- **`image_stamper.js`** - ES module with WASM loader and bindings
- **`image_stamper.d.ts`** - TypeScript type definitions
- **`image_stamper_bg.wasm`** - Compiled WebAssembly binary
- **`image_stamper_bg.wasm.d.ts`** - Additional type definitions
- **`package.json`** - Package metadata for the generated module

## Development Workflow

### 1. Modify Rust Code
Edit files in `wasm/src/` directory:
```bash
# Main implementation
vim wasm/src/lib.rs
```

### 2. Build and Test
```bash
# Build WASM module
npm run build:wasm

# Test in development
npm run dev
```

### 3. Debug WASM Issues
```bash
# Enable debug logging in Rust
console_log!("Debug message: {}", value);

# Check browser console for WASM errors
# Use browser dev tools to inspect WASM module
```

### 4. Performance Profiling
- Use browser dev tools Performance tab
- Monitor WASM memory usage
- Profile JavaScript ↔ WASM boundary crossings
- Optimize hot paths identified in profiling

## Troubleshooting WASM Issues

### Common Build Problems

#### 1. wasm-pack Not Found
```bash
# Error: command not found: wasm-pack
# Solution: Install wasm-pack
cargo install wasm-pack
```

#### 2. Missing WebAssembly Target
```bash
# Error: target 'wasm32-unknown-unknown' not found
# Solution: Add WebAssembly target
rustup target add wasm32-unknown-unknown
```

#### 3. Build Fails with Dependency Errors
```bash
# Clean and rebuild
cargo clean
npm run clean:wasm
npm run build:wasm
```

#### 4. WASM Files Not Found in Public Directory
```bash
# Ensure files are copied correctly
npm run copy:wasm

# Check if files exist
ls public/wasm/
```

### Runtime Issues

#### 1. WASM Module Failed to Load
- Check browser console for detailed error messages
- Verify WASM files are accessible via network tab
- Ensure proper MIME type for `.wasm` files

#### 2. Memory Allocation Errors
```rust
// Add panic hook for better error messages
#[wasm_bindgen]
pub fn init_panic_hook() {
    console_error_panic_hook::set_once();
}
```

#### 3. Performance Issues
- Profile using browser dev tools
- Check for excessive memory allocations
- Verify batch processing is working correctly

### Debug Logging

Enable detailed logging in the WASM module:

```rust
// Add debug output
console_log!("Processing image: {}x{}", width, height);
console_log!("Stamp size: {}x{}", stamp_width, stamp_height);
```

### Browser Compatibility

- **Chrome/Edge**: Full support for WASM and File System Access API
- **Firefox**: WASM support, limited File System Access API
- **Safari**: WASM support, no File System Access API

## Performance Benchmarks

Typical processing times on modern hardware:

- **1MP image**: ~50-100ms
- **5MP image**: ~200-400ms  
- **10MP image**: ~500-800ms

Memory usage scales linearly with image size:
- **1MP image**: ~4MB peak memory
- **5MP image**: ~20MB peak memory
- **10MP image**: ~40MB peak memory

## Contributing to WASM Module

### Code Style
- Follow Rust standard formatting (`cargo fmt`)
- Use `clippy` for linting (`cargo clippy`)
- Add documentation for public APIs
- Include error handling for all operations

### Testing
```bash
# Run Rust tests
cd wasm
cargo test

# Build and test integration
npm run build:wasm && npm run dev
```

### Adding New Features
1. Implement in `wasm/src/lib.rs`
2. Add appropriate `#[wasm_bindgen]` annotations
3. Update TypeScript definitions if needed
4. Test integration with frontend
5. Update documentation
