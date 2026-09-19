import JSZip from 'jszip';

export interface StampingProgress {
  current: number;
  total: number;
  currentFileName: string;
}

/**
 * Every tunable the WASM pipeline exposes.
 *
 * All optional. Anything left out keeps the default compiled into the crate — see the
 * `defaults` module in `wasm/src/lib.rs`. The numbers are deliberately *not* repeated here:
 * a copy on this side would drift from the Rust one the first time either changed, and the
 * only way to notice would be a wrongly stamped photo.
 */
export interface StampingOptions {
  /** 1-100. JPEG only; the WebP encoder in `image` 0.25 is lossless and ignores it. */
  quality?: number;

  /** Stamp opacity, 0-100. */
  opacity?: number;

  format?: 'jpg' | 'webp';

  /** Whether to write the filename along the bottom edge. */
  addFilename?: boolean;

  /** Clear space left around the stamp, in pixels of the source image. */
  stampPadding?: number;

  /** Largest image to decode, in megapixels. Anything bigger is refused from its header. */
  maxMegapixels?: number;

  /** Largest single dimension to decode, in pixels. */
  maxDimension?: number;

  /**
   * Colour that translucent pixels are composited onto when encoding JPEG, which has no
   * alpha channel. CSS hex; any alpha is ignored.
   */
  jpegMatte?: string;

  /**
   * Upscale factor above which the stamp is resized with the cheaper bilinear filter
   * instead of Lanczos3. Pass `Infinity` for always-Lanczos3, 0 for never.
   */
  lanczosMaxUpscale?: number;

  /** Caption height as a fraction of the frame's shorter side. */
  textSizeRatio?: number;

  /** Floor on the caption size, in pixels. */
  textSizeMin?: number;

  /** Ceiling on the caption size, in pixels. */
  textSizeMax?: number;

  /** Padding below the caption, as a fraction of the caption size. */
  textPaddingRatio?: number;

  /** Floor on that padding, in pixels. */
  textPaddingMin?: number;

  /** Caption colour as CSS hex, alpha honoured — e.g. `#7d7d7d80` for grey at 50 %. */
  textColor?: string;
}

export interface StampedImage {
  file: File;
  originalName: string;
}

/** The subset of the generated bindings this file uses. */
interface WasmStampOptions {
  quality: number;
  opacity: number;
  format: number;
  stamp_padding: number;
  max_megapixels: number;
  max_dimension: number;
  jpeg_matte: number;
  lanczos_max_upscale: number;
  text_size_ratio: number;
  text_size_min: number;
  text_size_max: number;
  text_padding_ratio: number;
  text_padding_min: number;
  text_color: number;
  free: () => void;
}

interface WasmStamper {
  setStamp: (bytes: Uint8Array, options: WasmStampOptions) => void;

  /**
   * Narrower than the generated `Uint8Array`, which is `Uint8Array<ArrayBufferLike>` and so
   * is not a `BlobPart` — `ArrayBufferLike` admits `SharedArrayBuffer`, which `new File()`
   * will not take. The glue ends in `getArrayU8FromWasm0(ptr, len).slice()`, a copy out of
   * the wasm instance's own memory, so the buffer is always a plain `ArrayBuffer`.
   */
  applyStamp: (bytes: Uint8Array, filename: string, options: WasmStampOptions) => Uint8Array<ArrayBuffer>;
  readonly hasStamp: boolean;
  readonly stampWidth: number;
  readonly stampHeight: number;
}

interface WasmModule {
  default: (init?: unknown) => Promise<unknown>;
  ImageStamper: new () => WasmStamper;
  StampOptions: new () => WasmStampOptions;
  OutputFormat: { Jpeg: number; WebP: number };
}

/**
 * Packs a CSS hex colour into the `0xRRGGBBAA` integer the WASM boundary takes.
 *
 * A `#[wasm_bindgen]` struct field cannot be an array or a string, so colours cross as one
 * integer. Accepts `#rgb`, `#rgba`, `#rrggbb` and `#rrggbbaa`; a missing alpha is opaque.
 *
 * Throws rather than falling back to a default: every caller is either a colour input, which
 * cannot produce anything else, or a literal in our own code. Silently substituting a colour
 * would show up only as a wrongly tinted watermark on delivered photos.
 */
export function packColor(hex: string): number {
  const digits = hex.trim().replace(/^#/, '');

  // Expand the shorthand forms, where each digit stands for a doubled byte.
  const full =
    digits.length === 3 || digits.length === 4
      ? digits
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : digits;

  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(full)) {
    throw new Error(`Invalid colour "${hex}". Expected CSS hex such as #7d7d7d or #7d7d7d80.`);
  }

  const rgba = full.length === 6 ? `${full}ff` : full;

  // >>> 0 because a value with the top bit set — anything from #80000000 up, which includes
  // every opaque colour — is otherwise read back as a negative number.
  return parseInt(rgba, 16) >>> 0;
}

/** What a folder save ended up doing, for the line the UI shows afterwards. */
export interface FolderSaveResult {
  /** The folder's own name, not its path — the API never reveals where it sits on disk. */
  directoryName: string;
  written: number;
}

export interface FolderSaveOptions {
  onProgress?: (progress: StampingProgress) => void;

  /**
   * Asked once, with the names already in the chosen folder that a save would replace.
   * Returning false backs out without writing anything.
   */
  onConflict?: (names: string[]) => boolean | Promise<boolean>;
}

/**
 * The slice of the File System Access API this file uses.
 *
 * Declared locally, under our own names, rather than as globals: a browser lib that already
 * ships these types would clash with a second global declaration, and only Chromium
 * implements them anyway.
 */
interface PickedFileHandle {
  createWritable: () => Promise<PickedFileWriter>;
}

interface PickedFileWriter {
  write: (data: BlobPart) => Promise<void>;
  close: () => Promise<void>;
  abort?: () => Promise<void>;
}

interface PickedDirectory {
  readonly name: string;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<PickedFileHandle>;
}

interface DirectoryPicker {
  showDirectoryPicker?: (options?: { id?: string; mode?: 'read' | 'readwrite'; startIn?: string }) => Promise<PickedDirectory>;
}

/**
 * Whether this browser can hand us a folder to write into.
 *
 * Chromium only, and only in a secure context; Firefox and Safari have no picker at all,
 * which is why the ZIP download stays the path every browser gets. Callers must check this
 * from `onMounted` — on the server there is no `window` to ask.
 */
export function canSaveToFolder(): boolean {
  return typeof window !== 'undefined' && typeof (window as unknown as DirectoryPicker).showDirectoryPicker === 'function';
}

export class ImageStampingService {
  private wasmModule: WasmModule | null = null;
  private stamper: WasmStamper | null = null;

  /**
   * The artifact lives in a version-stamped directory: the glue JS and its `.wasm` must
   * agree on wasm-bindgen's schema version, and at a fixed path a browser could hold a
   * cached glue from one deploy and fetch the `.wasm` from the next.
   */
  private wasmUrl(): string {
    const version = useRuntimeConfig().public.wasmVersion;

    return new URL(`/wasm/v${version}/image_stamper.js`, window.location.origin).href;
  }

  async initialize() {
    if (this.wasmModule) {
      return;
    }

    try {
      // Loaded by URL at runtime rather than bundled: wasm-pack writes the artifact into
      // public/, outside Vite's module graph.
      this.wasmModule = (await import(/* @vite-ignore */ this.wasmUrl())) as WasmModule;

      await this.wasmModule.default();
      this.stamper = new this.wasmModule.ImageStamper();
    } catch (error) {
      console.error('WASM loading error:', error);
      throw new Error('Failed to load WASM module. Make sure it is built and available.');
    }
  }

  /**
   * Builds a WASM options object carrying the crate's defaults, overridden by whatever the
   * caller actually set.
   *
   * The caller owns the result and must `free()` it — it is a handle into WASM linear
   * memory, not a JavaScript object the collector can reclaim.
   */
  private buildOptions(options: StampingOptions): WasmStampOptions {
    if (!this.wasmModule) {
      throw new Error('WASM module not initialized');
    }

    // Starts life holding the Rust defaults, so only the fields present below are touched.
    const wasm = new this.wasmModule.StampOptions();

    // `?? undefined` normalizes null to undefined so an explicitly-null field from a form
    // falls through to the default rather than crossing as 0.
    const set = <T>(value: T | undefined | null, apply: (value: T) => void) => {
      if (value !== undefined && value !== null) apply(value);
    };

    set(options.quality, (v) => (wasm.quality = v));
    set(options.opacity, (v) => (wasm.opacity = v));
    set(options.format, (v) => {
      wasm.format = v === 'webp' ? this.wasmModule!.OutputFormat.WebP : this.wasmModule!.OutputFormat.Jpeg;
    });
    set(options.stampPadding, (v) => (wasm.stamp_padding = v));
    set(options.maxMegapixels, (v) => (wasm.max_megapixels = v));
    set(options.maxDimension, (v) => (wasm.max_dimension = v));
    set(options.jpegMatte, (v) => (wasm.jpeg_matte = packColor(v)));
    set(options.lanczosMaxUpscale, (v) => (wasm.lanczos_max_upscale = v));
    set(options.textSizeRatio, (v) => (wasm.text_size_ratio = v));
    set(options.textSizeMin, (v) => (wasm.text_size_min = v));
    set(options.textSizeMax, (v) => (wasm.text_size_max = v));
    set(options.textPaddingRatio, (v) => (wasm.text_padding_ratio = v));
    set(options.textPaddingMin, (v) => (wasm.text_padding_min = v));
    set(options.textColor, (v) => (wasm.text_color = packColor(v)));

    return wasm;
  }

  /**
   * Decodes and keeps the stamp.
   *
   * Takes the options because the stamp goes through the same size limits as a photo — a
   * decompression bomb dropped into the stamp picker would trap the instance just as surely.
   */
  async setStamp(stampFile: File, options: StampingOptions = {}): Promise<void> {
    if (!this.stamper) {
      throw new Error('WASM module not initialized');
    }

    const bytes = new Uint8Array(await stampFile.arrayBuffer());
    const wasmOptions = this.buildOptions(options);

    try {
      this.stamper.setStamp(bytes, wasmOptions);
    } finally {
      wasmOptions.free();
    }
  }

  /** Whether a stamp is loaded, and how big it is. Useful for a preview in the UI. */
  get stampInfo(): { loaded: boolean; width: number; height: number } {
    if (!this.stamper?.hasStamp) {
      return { loaded: false, width: 0, height: 0 };
    }

    return { loaded: true, width: this.stamper.stampWidth, height: this.stamper.stampHeight };
  }

  async applyStampToImages(
    images: File[],
    options: StampingOptions = {},
    onProgress?: (progress: StampingProgress) => void
  ): Promise<StampedImage[]> {
    if (!this.stamper) {
      throw new Error('WASM module not initialized');
    }

    const addFilename = options.addFilename ?? true;
    const format = options.format ?? 'jpg';
    const extension = format === 'webp' ? 'webp' : 'jpg';
    const mimeType = format === 'webp' ? 'image/webp' : 'image/jpeg';

    // One options object for the whole batch rather than one per photo: it is a WASM
    // allocation, and nothing in it varies between images.
    const wasmOptions = this.buildOptions(options);
    const results: StampedImage[] = [];

    try {
      for (let i = 0; i < images.length; i++) {
        const image = images[i];

        if (!image) continue;

        onProgress?.({ current: i + 1, total: images.length, currentFileName: image.name });

        const baseName = image.name.replace(/\.[^/.]+$/, '');

        try {
          const bytes = new Uint8Array(await image.arrayBuffer());
          const stamped = this.stamper.applyStamp(bytes, addFilename ? baseName : '', wasmOptions);

          results.push({
            file: new File([stamped], `${baseName}_stamped.${extension}`, { type: mimeType }),
            originalName: image.name
          });
        } catch (error) {
          // The message now comes from a real Error thrown across the boundary, so it
          // already names the file's size, the limit, or the decoder's complaint.
          const detail = error instanceof Error ? error.message : String(error);

          throw new Error(`Failed to process image ${image.name}: ${detail}`);
        }
      }
    } finally {
      wasmOptions.free();
    }

    return results;
  }

  /**
   * Writes the stamped frames straight into a folder the user picks, with no archive in
   * between — the point being that the photos land where they are wanted, already unpacked.
   *
   * Rejects with the picker's own `AbortError` when the dialog is dismissed. That is a
   * cancel, not a failure, and callers stay quiet about it. Resolves to null when the user
   * declines the overwrite prompt, in which case nothing has been written yet.
   */
  async saveStampedImagesToFolder(
    stampedImages: StampedImage[],
    { onProgress, onConflict }: FolderSaveOptions = {}
  ): Promise<FolderSaveResult | null> {
    const picker = (window as unknown as DirectoryPicker).showDirectoryPicker;

    if (!picker) {
      throw new Error('This browser cannot pick a folder. Download the ZIP instead.');
    }

    // `id` makes Chromium reopen the dialog wherever the last batch was saved.
    const directory = await picker.call(window, { id: 'add-stamp-output', mode: 'readwrite' });

    // The picker grants write access to the whole folder, so a name already sitting there
    // would be replaced without a word. Find those first and let the caller ask about them.
    const clashes: string[] = [];

    for (const { file } of stampedImages) {
      try {
        await directory.getFileHandle(file.name);
        clashes.push(file.name);
      } catch {
        // Not there — nothing of the user's to overwrite.
      }
    }

    if (clashes.length > 0 && onConflict && !(await onConflict(clashes))) {
      return null;
    }

    let written = 0;

    for (const { file } of stampedImages) {
      onProgress?.({ current: written + 1, total: stampedImages.length, currentFileName: file.name });

      try {
        const handle = await directory.getFileHandle(file.name, { create: true });
        const writer = await handle.createWritable();
        let closed = false;

        try {
          await writer.write(file);
          await writer.close();
          closed = true;
        } finally {
          // A stream left open holds a lock on the file and leaves a zero-length stub
          // behind, so an interrupted write is discarded rather than half-committed.
          if (!closed) await writer.abort?.().catch(() => {});
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);

        throw new Error(`Failed to write ${file.name} into ${directory.name}: ${detail}`);
      }

      written++;
    }

    return { directoryName: directory.name, written };
  }

  async downloadStampedImages(stampedImages: StampedImage[]): Promise<void> {
    try {
      // Create a ZIP archive with all stamped images
      const zip = new JSZip();
      const folder = zip.folder('stamped-images');

      if (!folder) {
        throw new Error('Failed to create ZIP folder');
      }

      // Add all images to the ZIP
      for (const { file } of stampedImages) {
        const arrayBuffer = await file.arrayBuffer();
        folder.file(file.name, arrayBuffer);
      }

      // Generate the ZIP file
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });

      // Download the ZIP file
      const url = URL.createObjectURL(zipBlob);
      try {
        const a = document.createElement('a');
        a.href = url;
        a.download = `stamped-images-${new Date().getTime()}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Add a small delay before revoking URL
        await new Promise((resolve) => setTimeout(resolve, 100));
      } finally {
        URL.revokeObjectURL(url);
      }

      console.log(`Successfully created ZIP archive with ${stampedImages.length} images`);
    } catch (error) {
      console.error('Error creating ZIP archive:', error);
      throw new Error(`Failed to create ZIP archive: ${error}`);
    }
  }
}

export const useImageStamping = () => {
  const service = new ImageStampingService();

  return {
    service,
    initialize: () => service.initialize(),
    setStamp: (stampFile: File, options: StampingOptions = {}) => service.setStamp(stampFile, options),
    applyStampToImages: (
      images: File[],
      options: StampingOptions = {},
      onProgress?: (progress: StampingProgress) => void
    ) => service.applyStampToImages(images, options, onProgress),
    downloadStampedImages: (stampedImages: StampedImage[]) => service.downloadStampedImages(stampedImages),
    saveStampedImagesToFolder: (stampedImages: StampedImage[], options: FolderSaveOptions = {}) =>
      service.saveStampedImagesToFolder(stampedImages, options),
    canSaveToFolder
  };
};
