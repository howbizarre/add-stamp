<script lang='ts' setup>
import type { StampingProgress } from '~/composables/useImageStamping';
import { useImageStamping } from '~/composables/useImageStamping';

const selectedImages = ref<File[]>([]);
const selectedPngImage = ref<File | null>(null);
const stampedImages = ref<File[]>([]);
const isStamping = ref(false);
const stampingProgress = ref<StampingProgress>({ current: 0, total: 0, currentFileName: '' });

const { initialize, setStamp, applyStampToImages } = useImageStamping();

const handleImagesSelected = (images: File[]) => {
  selectedImages.value = images
  stampedImages.value = []; // Reset stamped images when new images are selected
};

const handleImagesReset = () => {
  selectedImages.value = [];
  stampedImages.value = [];
};

const handlePngImageSelected = (image: File) => {
  selectedPngImage.value = image;
};

const handlePngImageReset = () => {
  selectedPngImage.value = null;
};

const canAddStamp = computed(() => {
  return selectedImages.value.length > 0 && selectedPngImage.value !== null && !isStamping.value;
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

    // Optionally download the images
    // await downloadStampedImages(results);

  } catch (error) {
    console.error('Error adding stamp to images:', error);
    alert(`Error adding stamp: ${error}`);
  } finally {
    isStamping.value = false;
    stampingProgress.value = { current: 0, total: 0, currentFileName: '' };
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
            <h2 v-if="!canAddStamp && !isStamping" class="text-2xl font-semibold text-gray-700">Gallery</h2>
            
            <button v-if="canAddStamp && !isStamping"
                    @click="addStampToImages"
                    class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
              Add Stamp
            </button>

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

          <div v-if="stampedImages.length > 0" class="ml-4">
            <span class="px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded-full">
              ✓ Stamped Images
            </span>
          </div>
        </div>
        
        <ImageGallery :images="displayImages" />
      </section>
    </main>
  </div>
</template>