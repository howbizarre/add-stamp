import JSZip from 'jszip';
import type { ImageStamper, StampOptions } from '@howbizarre/image-stamper';

export interface StampingProgress {
  current: number;
  total: number;
  currentFileName: string;
}

/**
 * The engine's options plus the one switch that belongs to the app.
 *
 * `StampOptions` comes from `@howbizarre/image-stamper`: camelCase keys, CSS hex colours,
 * and every number left out keeps the default compiled into the crate. The defaults are
 * deliberately not repeated here — a copy on this side would drift from the engine's the
 * first time either changed, and the only way to notice would be a wrongly stamped photo.
 */
export interface StampingOptions extends StampOptions {
  /**
   * Whether to write the filename along the bottom edge. App-level: it decides what goes
   * into the engine's `caption`, which the engine draws as given and leaves empty otherwise.
   */
  addFilename?: boolean;
}

export interface StampedImage {
  file: File;
  originalName: string;
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
  private stamper: ImageStamper | null = null;

  /**
   * Loads the engine.
   *
   * Imported lazily, and only in the browser: the pages are prerendered on the server, where
   * there is nothing to stamp, and a static import would pull the WebAssembly glue into the
   * server bundle for nothing. Vite still sees the import at build time, so the `.wasm`
   * ships as a hashed asset under `/_nuxt/` and the glue finds it by its own URL — glue and
   * binary of one build always travel together, which is what makes immutable caching safe.
   */
  async initialize() {
    if (this.stamper) {
      return;
    }

    if (import.meta.server) {
      throw new Error('Image stamping runs in the browser only.');
    }

    try {
      const { createImageStamper } = await import('@howbizarre/image-stamper');

      this.stamper = await createImageStamper();
    } catch (error) {
      console.error('Image engine failed to load:', error);
      throw new Error('Failed to load the image engine. Check the connection and reload the page.');
    }
  }

  private get engine(): ImageStamper {
    if (!this.stamper) {
      throw new Error('Image engine not initialized');
    }

    return this.stamper;
  }

  /**
   * Decodes and keeps the stamp.
   *
   * Takes the options because the stamp goes through the same size limits as a photo — a
   * decompression bomb dropped into the stamp picker would trap the instance just as surely.
   */
  async setStamp(stampFile: File, options: StampingOptions = {}): Promise<void> {
    const { addFilename: _addFilename, ...engineOptions } = options;

    await this.engine.setStamp(stampFile, engineOptions);
  }

  /** Whether a stamp is loaded, and how big it is. Useful for a preview in the UI. */
  get stampInfo(): { loaded: boolean; width: number; height: number } {
    const stamper = this.stamper;

    if (!stamper?.hasStamp) {
      return { loaded: false, width: 0, height: 0 };
    }

    return { loaded: true, width: stamper.stampWidth, height: stamper.stampHeight };
  }

  async applyStampToImages(
    images: File[],
    options: StampingOptions = {},
    onProgress?: (progress: StampingProgress) => void
  ): Promise<StampedImage[]> {
    const engine = this.engine;
    const { addFilename = true, ...engineOptions } = options;
    const results: StampedImage[] = [];

    for (let i = 0; i < images.length; i++) {
      const image = images[i];

      if (!image) continue;

      onProgress?.({ current: i + 1, total: images.length, currentFileName: image.name });

      const baseName = image.name.replace(/\.[^/.]+$/, '');

      try {
        // The engine reports the encoding it actually used, so the extension and MIME type
        // cannot disagree with the bytes.
        const { bytes, mimeType, extension } = await engine.stamp(image, {
          ...engineOptions,
          caption: addFilename ? baseName : ''
        });

        results.push({
          file: new File([bytes], `${baseName}_stamped.${extension}`, { type: mimeType }),
          originalName: image.name
        });
      } catch (error) {
        // The message is a real Error from the engine, so it already names the file's size,
        // the limit, or the decoder's complaint.
        const detail = error instanceof Error ? error.message : String(error);

        throw new Error(`Failed to process image ${image.name}: ${detail}`);
      }
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
