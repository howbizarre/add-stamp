<script lang='ts' setup>
import type { StampingProgress } from '~/composables/useImageStamping';
import { useImageStamping } from '~/composables/useImageStamping';

const selectedImages = ref<File[]>([]);
const selectedPngImage = ref<File | null>(null);
const stampedImages = ref<File[]>([]);
const isStamping = ref(false);
const stampingProgress = ref<StampingProgress>({ current: 0, total: 0, currentFileName: '' });
const isStampingComplete = ref(false);
const isSaved = ref(false);
const selectedDirectoryHandle = ref<any>(null);

const { initialize, setStamp, applyStampToImages, saveStampedImagesToSpecificDirectory, downloadStampedImages } = useImageStamping();

const handleImagesSelected = (images: File[]) => {
  selectedImages.value = images
  stampedImages.value = []; // Reset stamped images when new images are selected
  isStampingComplete.value = false;
  isSaved.value = false;
  selectedDirectoryHandle.value = null;
};

const handleImagesReset = () => {
  selectedImages.value = [];
  stampedImages.value = [];
  isStampingComplete.value = false;
  isSaved.value = false;
  selectedDirectoryHandle.value = null;
};

const handlePngImageSelected = (image: File) => {
  selectedPngImage.value = image;
  isStampingComplete.value = false;
  isSaved.value = false;
};

const handlePngImageReset = () => {
  selectedPngImage.value = null;
  isStampingComplete.value = false;
  isSaved.value = false;
};

const canAddStamp = computed(() => {
  return selectedImages.value.length > 0 && selectedPngImage.value !== null && !isStamping.value && !isStampingComplete.value;
});

const showStampedLabel = computed(() => {
  return isStampingComplete.value && !isStamping.value;
});

const showSaveButton = computed(() => {
  return isStampingComplete.value && !isSaved.value;
});

const displayImages = computed(() => {
  return stampedImages.value.length > 0 ? stampedImages.value : selectedImages.value;
});

const addStampToImages = async () => {
  if (!selectedPngImage.value || selectedImages.value.length === 0) {
    return;
  }

  try {
    isStamping.value = true;
    stampingProgress.value = { current: 0, total: selectedImages.value.length, currentFileName: '' };

    // Initialize WASM module
    await initialize();

    // Set the stamp
    await setStamp(selectedPngImage.value);

    // Apply stamp to all images
    const results = await applyStampToImages(
      selectedImages.value,
      (progress: StampingProgress) => {
        stampingProgress.value = progress;
      }
    );

    // Update the gallery with stamped images
    stampedImages.value = results.map((result: { file: File; originalName: string }) => result.file);
    
    // Mark stamping as complete
    isStampingComplete.value = true;

  } catch (error) {
    console.error('Error adding stamp to images:', error);
    alert(`Error adding stamp: ${error}`);
  } finally {
    isStamping.value = false;
    stampingProgress.value = { current: 0, total: 0, currentFileName: '' };
  }
};

const saveStampedImages = async () => {
  if (stampedImages.value.length === 0) {
    return;
  }

  try {
    // Convert File objects back to the format expected by save function
    const results = stampedImages.value.map(file => ({
      file,
      originalName: file.name.replace('_stamped.webp', '')
    }));

    // If we don't have a directory handle, ask for one
    if (!selectedDirectoryHandle.value) {
      try {
        if ('showDirectoryPicker' in window) {
          selectedDirectoryHandle.value = await (window as any).showDirectoryPicker({
            mode: 'readwrite'
          });
        } else {
          // Fallback to downloads if File System Access API not supported
          await downloadStampedImages(results);
          isSaved.value = true;
          return;
        }
      } catch (error) {
        if ((error as any).name === 'AbortError') {
          console.log('User cancelled directory selection');
          return;
        }
        throw error;
      }
    }

    // Use the directory handle to save directly
    await saveStampedImagesToSpecificDirectory(results, selectedDirectoryHandle.value);
    isSaved.value = true;
  } catch (error) {
    console.error('Error saving stamped images:', error);
    alert(`Error saving images: ${error}`);
  }
};
</script>

<template>
  <div class="container mx-auto p-4 sm:p-6 lg:p-8">
    <header class="text-center mb-8">
      <h1 class="text-4xl font-bold text-gray-800">My Photo Gallery</h1>
      <p class="text-lg text-gray-600">Upload and browse your photos</p>
    </header>

    <main class="mx-auto bg-white p-6 rounded-lg space-y-8">
      <!-- Upload Section -->
      <section>
        <h2 class="text-2xl font-semibold text-gray-700 mb-4">Upload Files</h2>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Multiple Images Uploader -->
          <div>
            <h3 class="text-lg font-medium text-gray-600 mb-3">Multiple Images Gallery</h3>
            <ImageUploader :selected-images="selectedImages"
                           @images-selected="handleImagesSelected"
                           @images-reset="handleImagesReset" />
          </div>

          <!-- Stamp Picker -->
          <div>
            <h3 class="text-lg font-medium text-gray-600 mb-3">Stamp Picker (PNG only)</h3>
            <StampPicker :selected-image="selectedPngImage"
                         @image-selected="handlePngImageSelected"
                         @image-reset="handlePngImageReset" />
          </div>
        </div>
      </section>

      <!-- Divider -->
      <hr class="border-gray-200">

      <!-- Gallery Section -->
      <section>
        <div class="flex justify-between items-center mb-4">
          <div class="flex-1">
            <h2 v-if="!canAddStamp && !isStamping && !showStampedLabel" class="text-2xl font-semibold text-gray-700">Gallery</h2>
            
            <button v-if="canAddStamp && !isStamping"
                    @click="addStampToImages"
                    class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
              Add Stamp
            </button>

            <h2 v-if="showStampedLabel" class="text-2xl font-semibold text-gray-700">Stamped Gallery</h2>

            <div v-if="isStamping" class="flex items-center space-x-4">
              <div class="flex items-center space-x-2">
                <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                <span class="text-lg font-medium text-gray-700">Processing Images...</span>
              </div>
              
              <div class="flex-1 max-w-md">
                <div class="bg-gray-200 rounded-full h-2">
                  <div class="bg-blue-600 h-2 rounded-full transition-all duration-300"
                       :style="{ width: `${(stampingProgress.current / stampingProgress.total) * 100}%` }">
                  </div>
                </div>
                <p class="text-sm text-gray-600 mt-1">
                  {{ stampingProgress.current }} / {{ stampingProgress.total }} - {{ stampingProgress.currentFileName }}
                </p>
              </div>
            </div>
          </div>

          <div v-if="showSaveButton || isSaved" class="ml-4 flex items-center space-x-3">
            <button v-if="showSaveButton"
                    @click="saveStampedImages"
                    class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2">
              Save to Directory
            </button>
            
            <span v-if="isSaved" class="px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded-full">
              ✓ Stamped Images
            </span>
          </div>
        </div>
        
        <ImageGallery :images="displayImages" />
      </section>
    </main>
  </div>
</template>