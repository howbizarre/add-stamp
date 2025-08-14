export interface StampingProgress {
  current: number;
  total: number;
  currentFileName: string;
}

export interface StampingOptions {
  quality?: number; // 1-100, default 75
  format?: 'jpg' | 'webp'; // default 'jpg'
  opacity?: number; // 1-100, default 50 (for stamp opacity)
  addFilename?: boolean; // whether to add filename to the watermark
}

export class ImageStampingService {
  private wasmModule: any = null;
  private stamper: any = null;

  async initialize() {
    if (!this.wasmModule) {
      // Import the WASM module - will be created after building
      try {
        // Use dynamic import with base URL
        const wasmModuleUrl = new URL('/wasm/image_stamper.js', window.location.origin).href;
        this.wasmModule = await import(/* @vite-ignore */ wasmModuleUrl);
        await this.wasmModule.default();
        this.stamper = new this.wasmModule.ImageStamper();
      } catch (error) {
        console.error('WASM loading error:', error);
        throw new Error('Failed to load WASM module. Make sure it is built and available.');
      }
    }
  }

  async setStamp(stampFile: File): Promise<void> {
    if (!this.stamper) {
      throw new Error('WASM module not initialized');
    }

    const arrayBuffer = await stampFile.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    await this.stamper.set_stamp(uint8Array);
  }

  async applyStampToImages(
    images: File[], 
    options: StampingOptions = {},
    onProgress?: (progress: StampingProgress) => void
  ): Promise<{ file: File; originalName: string }[]> {
    if (!this.stamper) {
      throw new Error('WASM module not initialized');
    }

    // Set default options
    const quality = options.quality ?? 75;
    const format = options.format ?? 'jpg';
    const opacity = options.opacity ?? 50;
    const addFilename = options.addFilename ?? true; // Default to true

    const results: { file: File; originalName: string }[] = [];

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      
      if (!image) continue;
      
      if (onProgress) {
        onProgress({
          current: i + 1,
          total: images.length,
          currentFileName: image.name
        });
      }

      try {
        const arrayBuffer = await image.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // Extract filename without extension for the watermark
        const fileNameForText = addFilename ? image.name.replace(/\.[^/.]+$/, '') : '';
        
        // Use the new method with options, filename and opacity
        const stampedImageData = await this.stamper.apply_stamp_with_options_text_and_opacity(
          uint8Array, 
          quality, 
          format,
          fileNameForText,
          opacity
        );
        
        // Create new file with appropriate extension
        const originalName = image.name;
        const fileNameForWatermark = originalName.replace(/\.[^/.]+$/, '');
        const extension = format === 'jpg' ? 'jpg' : 'webp';
        const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/webp';
        const newFileName = `${fileNameForWatermark}_stamped.${extension}`;
        
        const stampedFile = new File([stampedImageData], newFileName, {
          type: mimeType
        });

        results.push({
          file: stampedFile,
          originalName: originalName
        });
      } catch (error) {
        console.error(`Error processing image ${image.name}:`, error);
        throw new Error(`Failed to process image ${image.name}: ${error}`);
      }
    }

    return results;
  }

  async saveStampedImagesToDirectory(stampedImages: { file: File; originalName: string }[]): Promise<void> {
    try {
      // Check if File System Access API is supported
      if (!('showDirectoryPicker' in window)) {
        console.warn('File System Access API not supported, falling back to individual downloads');
        await this.downloadStampedImages(stampedImages);
        return;
      }

      // Request directory access
      const directoryHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite'
      });

      // Create stamped-images subdirectory
      const stampedDirHandle = await directoryHandle.getDirectoryHandle('stamped-images', {
        create: true
      });

      // Save each image to the subdirectory
      for (const { file } of stampedImages) {
        const fileHandle = await stampedDirHandle.getFileHandle(file.name, {
          create: true
        });
        
        const writable = await fileHandle.createWritable();
        await writable.write(file);
        await writable.close();
      }

      console.log(`Successfully saved ${stampedImages.length} images to stamped-images directory`);
    } catch (error) {
      if ((error as any).name === 'AbortError') {
        console.log('User cancelled directory selection');
        return;
      }
      
      console.error('Error saving to directory:', error);
      // Fallback to downloads
      await this.downloadStampedImages(stampedImages);
    }
  }

  async saveStampedImagesToSpecificDirectory(
    stampedImages: { file: File; originalName: string }[], 
    directoryHandle: any
  ): Promise<void> {
    try {
      // Create stamped-images subdirectory
      const stampedDirHandle = await directoryHandle.getDirectoryHandle('stamped-images', {
        create: true
      });

      // Save each image to the subdirectory
      for (const { file } of stampedImages) {
        const fileHandle = await stampedDirHandle.getFileHandle(file.name, {
          create: true
        });
        
        const writable = await fileHandle.createWritable();
        await writable.write(file);
        await writable.close();
      }

      console.log(`Successfully saved ${stampedImages.length} images to stamped-images directory`);
    } catch (error) {
      console.error('Error saving to specific directory:', error);
      // Fallback to downloads
      await this.downloadStampedImages(stampedImages);
    }
  }

  async downloadStampedImages(stampedImages: { file: File; originalName: string }[]): Promise<void> {
    // Create a directory handle (this would need to be adapted based on your needs)
    // For now, we'll just download them individually
    for (const { file } of stampedImages) {
      const url = URL.createObjectURL(file);
      try {
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        // Add a small delay to ensure download starts before revoking URL
        await new Promise(resolve => setTimeout(resolve, 100));
      } finally {
        // Always revoke the URL to prevent memory leaks
        URL.revokeObjectURL(url);
      }
    }
  }
}

export const useImageStamping = () => {
  const service = new ImageStampingService();
  
  return {
    service,
    initialize: () => service.initialize(),
    setStamp: (stampFile: File) => service.setStamp(stampFile),
    applyStampToImages: (
      images: File[], 
      options: StampingOptions = {}, 
      onProgress?: (progress: StampingProgress) => void
    ) => service.applyStampToImages(images, options, onProgress),
    downloadStampedImages: (stampedImages: { file: File; originalName: string }[]) => 
      service.downloadStampedImages(stampedImages),
    saveStampedImagesToDirectory: (stampedImages: { file: File; originalName: string }[]) => 
      service.saveStampedImagesToDirectory(stampedImages),
    saveStampedImagesToSpecificDirectory: (stampedImages: { file: File; originalName: string }[], directoryHandle: any) => 
      service.saveStampedImagesToSpecificDirectory(stampedImages, directoryHandle)
  };
};
