<template>
  <div class="mx-auto">
    <div class="flex justify-between items-center mb-2">
      <template v-if="!hasSelectedImages">
        <label for="file-upload" class="block text-sm font-medium text-gray-700">
          Select images
        </label>
      </template>

      <template v-if="hasSelectedImages">
        <button @click="resetImages"
                class="bg-red-500 hover:bg-red-600 text-white focus:ring-red-500">
          Reset Images
        </button>
      </template>
    </div>

    <div @drop="handleDrop" @dragover="handleDragOver" @dragenter="handleDragEnter" @dragleave="handleDragLeave" :class="{ 'border-indigo-500 bg-indigo-50': isDragOver }" class="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md transition-colors">
      <div class="space-y-1 text-center">
        <svg class="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
          <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>

        <div class="flex text-sm text-gray-600">
          <label for="file-upload" class="relative cursor-pointer bg-white rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500">
            <span>Add images</span>
            <input id="file-upload" name="file-upload" type="file" class="sr-only" multiple @change="handleFileChange" accept="image/*">
          </label>

          <p class="pl-1">or drag and drop them</p>
        </div>

        <p class="text-xs text-gray-500">PNG, JPG, GIF up to 10MB</p>
      </div>
    </div>
  </div>
</template>

<script lang='ts' setup>
interface Props { selectedImages?: File[]; }

const props = withDefaults(defineProps<Props>(), {
  selectedImages: () => []
});

const emit = defineEmits(['images-selected', 'images-reset']);

const isDragOver = ref(false);

const hasSelectedImages = computed(() => props.selectedImages && props.selectedImages.length > 0);

const resetImages = () => { emit('images-reset'); };

const handleFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement;

  if (target.files) {
    emit('images-selected', Array.from(target.files));
  }
};

const handleDrop = (event: DragEvent) => {
  event.preventDefault();
  isDragOver.value = false;

  const files = event.dataTransfer?.files;
  if (files && files.length > 0) {
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));

    if (imageFiles.length > 0) {
      emit('images-selected', imageFiles);
    }
  }
};

const handleDragOver = (event: DragEvent) => { event.preventDefault(); };
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
</script>