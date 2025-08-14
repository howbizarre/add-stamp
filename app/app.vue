<script lang='ts' setup>
import type { StampingProgress } from '~/composables/useImageStamping';
import { useImageStamping } from '~/composables/useImageStamping';

const selectedImages = ref<File[]>([]);
const selectedPngImage = ref<File | null>(null);
const stampOpacity = ref<number>(100);
const stampedImages = ref<File[]>([]);
const isStamping = ref(false);
const stampingProgress = ref<StampingProgress>({ current: 0, total: 0, currentFileName: '' });
const isStampingComplete = ref(false);
const isSaving = ref(false);
const isSaved = ref(false);
const selectedDirectoryHandle = ref<any>(null);
const savedPath = ref<string | null>(null);

const { initialize, setStamp, applyStampToImages, saveStampedImagesToSpecificDirectory, downloadStampedImages } = useImageStamping();

const handleImagesSelected = (images: File[]) => {
  selectedImages.value = images
  stampedImages.value = []; // Reset stamped images when new images are selected
  isStampingComplete.value = false;
  isSaved.value = false;
  selectedDirectoryHandle.value = null;
  savedPath.value = null;
};

const handleImagesReset = () => {
  selectedImages.value = [];
  stampedImages.value = [];
  isStampingComplete.value = false;
  isSaved.value = false;
  selectedDirectoryHandle.value = null;
  savedPath.value = null;
};

const handlePngImageSelected = (image: File) => {
  selectedPngImage.value = image;
  isStampingComplete.value = false;
  isSaved.value = false;
  savedPath.value = null;
};

const handlePngImageReset = () => {
  selectedPngImage.value = null;
  isStampingComplete.value = false;
  isSaved.value = false;
  savedPath.value = null;
};

const handleOpacityChanged = (opacity: number) => {
  stampOpacity.value = opacity;
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
  if (!canAddStamp.value) {
    return;
  }

  isStamping.value = true;
  stampingProgress.value = { current: 0, total: selectedImages.value.length, currentFileName: '' };

  try {
    // Initialize the WASM module
    await initialize();

    // Set the stamp
    if (!selectedPngImage.value) {
      throw new Error('No stamp image selected');
    }
    await setStamp(selectedPngImage.value);

    // Apply stamp to all images with JPG format, 75% quality and custom opacity
    const results = await applyStampToImages(
      selectedImages.value,
      { format: 'jpg', quality: 75, opacity: stampOpacity.value }, // JPG format with custom opacity
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

  isSaving.value = true;

  try {
    const results = stampedImages.value.map(file => ({
      file,
      originalName: file.name.replace(/_stamped\.(jpg|webp)$/, '')
    }));

    if (!selectedDirectoryHandle.value) {
      try {
        if ('showDirectoryPicker' in window) {
          selectedDirectoryHandle.value = await (window as any).showDirectoryPicker({
            mode: 'readwrite'
          });
        } else {
          await downloadStampedImages(results);
          isSaved.value = true;
          savedPath.value = 'downloads';
          isSaving.value = false;
          return;
        }
      } catch (error) {
        if ((error as any).name === 'AbortError') {
          console.log('User cancelled directory selection');
          isSaving.value = false;
          return;
        }
        throw error;
      }
    }

    await saveStampedImagesToSpecificDirectory(results, selectedDirectoryHandle.value);
    savedPath.value = `${selectedDirectoryHandle.value.name}/stamped-images`;
    isSaved.value = true;
  } catch (error) {
    console.error('Error saving stamped images:', error);
    alert(`Error saving images: ${error}`);
  } finally {
    isSaving.value = false;
  }
};
</script>

<template>
  <div class="container mx-auto p-4 sm:p-6 lg:p-8">
    <header class="text-center mb-8">
      <h1 class="text-4xl font-bold text-gray-800">Image Watermarking App</h1>
      <p class="text-lg text-gray-600">Add a stamp (watermark) to the set of images and save them locally</p>
    </header>

    <main class="mx-auto bg-white p-6 rounded-lg space-y-8">
      <!-- Upload Section -->
      <section>
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
                         :opacity="stampOpacity"
                         @image-selected="handlePngImageSelected"
                         @image-reset="handlePngImageReset"
                         @opacity-changed="handleOpacityChanged" />
          </div>
        </div>
      </section>

      <!-- Divider -->
      <hr v-if="selectedImages && selectedImages.length > 0" class="border-gray-200 mb-3">

      <!-- Gallery Section -->
      <section>
        <div class="flex justify-between items-center mb-4">
          <div class="flex-1">
            <button v-if="canAddStamp && !isStamping"
                    @click="addStampToImages"
                    class="bg-lime-500 hover:bg-lime-600 text-white focus:ring-lime-500 mt-3">
              Apply Stamp
            </button>

            <h2 v-if="showStampedLabel" class="text-2xl font-semibold text-gray-700">Stamped Gallery</h2>

            <div v-if="isStamping" class="flex items-center space-x-4">
              <div class="flex items-center space-x-2">
                <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-black"></div>
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

          <div v-if="showSaveButton || isSaved" class="ml-4 flex items-center space-x-3 mt-3">
            <button v-if="showSaveButton"
                    @click="saveStampedImages"
                    :disabled="isSaving"
                    :class="{ 'cursor-not-allowed!': isSaving }"
                    class="bg-green-500 hover:bg-green-600 text-white focus:ring-green-500">
              Save to Directory
            </button>

            <div v-if="isSaving" class="animate-spin rounded-full h-6 w-6 border-b-2 border-black">
              <span class="sr-only">Saving Images...</span>
            </div>

            <div v-if="isSaved" class="px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded-full">
              <span v-if="savedPath === 'downloads'">✓ Images downloaded individually</span>
              <span v-else>✓ Saved to {{ savedPath }}</span>
            </div>
          </div>
        </div>

        <ImageGallery :images="displayImages" />
      </section>

      <hr class="border-gray-200 mb-1">

      <footer class="flex items-center justify-between p-2">
        <p class="flex items-center gap-2">
          <strong>🖖</strong> <span>Live long and prosper</span>
        </p>

        <p class="flex items-center gap-3">
          <a href="https://github.com/howbizarre" target="_blank" class="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-github" viewBox="0 0 16 16">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8" />
            </svg>
          </a>

          <a href="https://x.com/howbizarre" target="_blank" class="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-twitter-x" viewBox="0 0 16 16">
              <path d="M12.6.75h2.454l-5.36 6.142L16 15.25h-4.937l-3.867-5.07-4.425 5.07H.316l5.733-6.57L0 .75h5.063l3.495 4.633L12.601.75Zm-.86 13.028h1.36L4.323 2.145H2.865z" />
            </svg>
          </a>
        </p>
      </footer>
    </main>
  </div>
</template>