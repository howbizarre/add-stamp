export interface StampingProgress {
  current: number;
  total: number;
  currentFileName: string;
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
    onProgress?: (progress: StampingProgress) => void
  ): Promise<{ file: File; originalName: string }[]> {
    if (!this.stamper) {
      throw new Error('WASM module not initialized');
    }

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
        
        const stampedImageData = await this.stamper.apply_stamp(uint8Array);
        
        // Create new file with .webp extension
        const originalName = image.name;
        const nameWithoutExt = originalName.replace(/\.[^/.]+$/, '');
        const newFileName = `${nameWithoutExt}_stamped.webp`;
        
        const stampedFile = new File([stampedImageData], newFileName, {
          type: 'image/webp'
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

  async downloadStampedImages(stampedImages: { file: File; originalName: string }[]): Promise<void> {
    // Create a directory handle (this would need to be adapted based on your needs)
    // For now, we'll just download them individually
    for (const { file } of stampedImages) {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }
}

export const useImageStamping = () => {
  const service = new ImageStampingService();
  
  return {
    service,
    initialize: () => service.initialize(),
    setStamp: (stampFile: File) => service.setStamp(stampFile),
    applyStampToImages: (images: File[], onProgress?: (progress: StampingProgress) => void) => 
      service.applyStampToImages(images, onProgress),
    downloadStampedImages: (stampedImages: { file: File; originalName: string }[]) => 
      service.downloadStampedImages(stampedImages)
  };
};
