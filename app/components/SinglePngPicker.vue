<template>
  <div class="mx-auto">
    <div class="flex justify-between items-center mb-2">
      <template v-if="!selectedImage">
        <label for="png-upload" class="block text-sm font-medium text-gray-700">
          Изберете PNG снимка
        </label>
      </template>

      <template v-if="selectedImage">
        <div class="flex gap-2">
          <span class="text-sm text-gray-600">{{ selectedImage.name }}</span>
          <button @click="resetImage"
                  class="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2">
            Премахни
          </button>
        </div>
      </template>
    </div>

    <!-- Upload Area (показва се само ако няма избрана снимка) -->
    <div v-if="!selectedImage"
         @drop="handleDrop" 
         @dragover="handleDragOver" 
         @dragenter="handleDragEnter" 
         @dragleave="handleDragLeave" 
         :class="{ 'border-indigo-500 bg-indigo-50': isDragOver }" 
         class="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md transition-colors cursor-pointer hover:border-indigo-400">
      
      <div class="space-y-1 text-center">
        <svg class="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
          <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>

        <div class="flex text-sm text-gray-600">
          <label for="png-upload" class="relative cursor-pointer bg-white rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500">
            <span>Качете PNG файл</span>
            <input id="png-upload" 
                   name="png-upload" 
                   type="file" 
                   class="sr-only" 
                   @change="handleFileChange" 
                   accept=".png">
          </label>

          <p class="pl-1">или го завлачете тук</p>
        </div>

        <p class="text-xs text-gray-500">Само PNG файлове до 10MB</p>
      </div>
    </div>

    <!-- Image Preview (показва се само ако има избрана снимка) -->
    <div v-if="selectedImage && imagePreviewUrl" class="mt-4">
      <div class="relative group">
        <img :src="imagePreviewUrl"
             :alt="selectedImage.name"
             class="w-full max-w-md mx-auto rounded-lg shadow-lg border border-gray-200" />
        
        <div class="absolute bottom-0 left-0 right-0 rounded-bl-lg rounded-br-lg bg-black bg-opacity-75 text-white text-sm p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div class="flex justify-between items-center">
            <span>{{ selectedImage.name }}</span>
            <span class="text-xs">{{ formatFileSize(selectedImage.size) }}</span>
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

// Следи за промени в избраната снимка
watch(
  () => props.selectedImage,
  async (newImage) => {
    // Изчистваме предишния URL
    if (imagePreviewUrl.value) {
      URL.revokeObjectURL(imagePreviewUrl.value);
      imagePreviewUrl.value = null;
    }
    
    imageMetadata.value = null;
    errorMessage.value = '';

    if (newImage) {
      // Създаваме нов preview URL
      imagePreviewUrl.value = URL.createObjectURL(newImage);
      
      // Получаваме метаданните на снимката
      try {
        imageMetadata.value = await getImageMetadata(newImage);
      } catch (error) {
        console.error('Error loading image metadata:', error);
      }
    }
  },
  { immediate: true }
);

// Почистване при unmount
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
  // Проверка на разширението
  if (!file.name.toLowerCase().endsWith('.png')) {
    errorMessage.value = 'Моля, изберете PNG файл.';
    return false;
  }

  // Проверка на MIME типа
  if (file.type !== 'image/png') {
    errorMessage.value = 'Файлът не е валиден PNG формат.';
    return false;
  }

  // Проверка на размера (10MB)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    errorMessage.value = 'Файлът е твърде голям. Максималният размер е 10MB.';
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
  
  // Изчистваме input-а за да можем да изберем същия файл отново
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
