<template>
  <div class="mx-auto">
    <div class="flex justify-between items-center mb-2">
      <template v-if="!selectedImage">
        <label for="png-upload" class="block text-sm font-medium text-gray-700">
          Select a PNG image
        </label>
      </template>

      <template v-if="selectedImage">
        <div class="flex gap-2 items-center">
          <span class="text-sm text-gray-600">{{ selectedImage.name }}</span>
          <button @click="resetImage"
                  class="bg-red-500 hover:bg-red-600 text-white focus:ring-red-500">
            Remove Stamp
          </button>
        </div>
      </template>
    </div>

    <!-- Upload Area or Image Preview -->
    <div @drop="handleDrop"
         @dragover="handleDragOver"
         @dragenter="handleDragEnter"
         @dragleave="handleDragLeave"
         :class="{ 'border-indigo-500 bg-indigo-50': isDragOver }"
         class="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md transition-colors cursor-pointer hover:border-indigo-400">

      <!-- Upload content (shows only when no image is selected) -->
      <div v-if="!selectedImage" class="space-y-1 text-center">
        <svg class="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
          <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>

        <div class="flex text-sm text-gray-600">
          <label for="png-upload" class="relative cursor-pointer bg-white rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500">
            <span>Add Stamp file</span>
            <input id="png-upload"
                   name="png-upload"
                   type="file"
                   class="sr-only"
                   @change="handleFileChange"
                   accept=".png">
          </label>

          <p class="pl-1">or drag and drop it here</p>
        </div>

        <p class="text-xs text-gray-500">PNG files only, up to 10MB</p>
      </div>

      <!-- Image Preview (shows only when an image is selected) -->
      <div v-if="selectedImage && imagePreviewUrl" class="relative group flex items-center justify-center w-full h-full p-2">
        <img :src="imagePreviewUrl"
             :alt="selectedImage.name"
             class="max-h-20 max-w-full object-contain rounded shadow-md" />

        <div class="absolute bottom-1 left-1 right-1 bg-black bg-opacity-75 text-white text-xs p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded">
          <div class="flex justify-between items-center">
            <span class="truncate">{{ selectedImage.name }}</span>
            <span class="ml-2">{{ formatFileSize(selectedImage.size) }}</span>
          </div>
          <div v-if="imageMetadata" class="text-xs mt-1 text-gray-300">
            {{ imageMetadata.width }}x{{ imageMetadata.height }} px
          </div>
        </div>
      </div>
    </div>

    <!-- Error Message -->
    <div v-if="errorMessage" class="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
      <p class="text-sm text-red-600">{{ errorMessage }}</p>
    </div>
  </div>
</template>

<script lang='ts' setup>
interface Props {
  selectedImage?: File | null;
}

interface ImageMetadata {
  width: number;
  height: number;
}

const props = withDefaults(defineProps<Props>(), {
  selectedImage: null
});

const emit = defineEmits(['image-selected', 'image-reset']);

const isDragOver = ref(false);
const imagePreviewUrl = ref<string | null>(null);
const imageMetadata = ref<ImageMetadata | null>(null);
const errorMessage = ref<string>('');

// Watch for changes in the selected image
watch(
  () => props.selectedImage,
  async (newImage) => {
    // Clear the previous URL
    if (imagePreviewUrl.value) {
      URL.revokeObjectURL(imagePreviewUrl.value);
      imagePreviewUrl.value = null;
    }
    
    imageMetadata.value = null;
    errorMessage.value = '';

    if (newImage) {
      // Create new preview URL
      imagePreviewUrl.value = URL.createObjectURL(newImage);
      
      // Get image metadata
      try {
        imageMetadata.value = await getImageMetadata(newImage);
      } catch (error) {
        console.error('Error loading image metadata:', error);
      }
    }
  },
  { immediate: true }
);

// Cleanup on unmount
onUnmounted(() => {
  if (imagePreviewUrl.value) {
    URL.revokeObjectURL(imagePreviewUrl.value);
  }
});

const resetImage = () => {
  errorMessage.value = '';
  emit('image-reset');
};

const validatePngFile = (file: File): boolean => {
  // Check file extension
  if (!file.name.toLowerCase().endsWith('.png')) {
    errorMessage.value = 'Please select a PNG file.';
    return false;
  }

  // Check MIME type
  if (file.type !== 'image/png') {
    errorMessage.value = 'The file is not a valid PNG format.';
    return false;
  }

  // Check file size (10MB)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    errorMessage.value = 'File is too large. Maximum size is 10MB.';
    return false;
  }

  return true;
};

const handleFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  
  if (target.files && target.files.length > 0) {
    const file = target.files[0];
    
    if (file && validatePngFile(file)) {
      errorMessage.value = '';
      emit('image-selected', file);
    }
  }
  
  // Clear the input to allow selecting the same file again
  target.value = '';
};

const handleDrop = (event: DragEvent) => {
  event.preventDefault();
  isDragOver.value = false;

  const files = event.dataTransfer?.files;
  if (files && files.length > 0) {
    const file = files[0];
    
    if (file && validatePngFile(file)) {
      errorMessage.value = '';
      emit('image-selected', file);
    }
  }
};

const handleDragOver = (event: DragEvent) => {
  event.preventDefault();
};

const handleDragEnter = (event: DragEvent) => {
  event.preventDefault();
  isDragOver.value = true;
};

const handleDragLeave = (event: DragEvent) => {
  event.preventDefault();
  const currentTarget = event.currentTarget as HTMLElement | null;

  if (currentTarget && !currentTarget.contains(event.relatedTarget as Node)) {
    isDragOver.value = false;
  }
};

const getImageMetadata = (file: File): Promise<ImageMetadata> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
</script>
