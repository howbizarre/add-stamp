<script lang='ts' setup>
interface Image {
  url: string;
  meta: {
    width: number;
    height: number;
    orientation: 'portrait' | 'landscape' | 'square';
    filename: string;
  };
}

const props = defineProps({ images: Array as () => File[] });
const images = ref<Image[]>([]);
const isLoading = ref(false);

const getImageMetadata = (file: File): Promise<Image> => {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      let orientation: 'portrait' | 'landscape' | 'square';

      if (width > height) {
        orientation = 'landscape';
      } else if (height > width) {
        orientation = 'portrait';
      } else {
        orientation = 'square';
      }

      resolve({
        url,
        meta: {
          width,
          height,
          orientation,
          filename: file.name
        }
      });
    };

    img.onerror = () => {
      // Clean up the URL on error to prevent memory leak
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to load image: ${file.name}`));
    };

    img.src = url;
  });
};

watch(
  () => props.images,
  async (newImages) => {
    // Clean up existing URLs before processing new images
    images.value.forEach(meta => URL.revokeObjectURL(meta.url));
    images.value = [];

    if (!newImages || newImages.length === 0) {
      isLoading.value = false;
      return;
    }

    isLoading.value = true;

    try {
      const metadataPromises = newImages.map(file => getImageMetadata(file));
      images.value = await Promise.all(metadataPromises);
    } catch (error) {
      console.error('Error loading image metadata:', error);
      // Keep existing images if some fail to load, but filter out failed ones
      const settledPromises = await Promise.allSettled(newImages.map(file => getImageMetadata(file)));
      images.value = settledPromises
        .filter((result): result is PromiseFulfilledResult<Image> => result.status === 'fulfilled')
        .map(result => result.value);
    } finally {
      isLoading.value = false;
    }
  },
  { immediate: true }
);

onUnmounted(() => {
  images.value.forEach(meta => URL.revokeObjectURL(meta.url));
});
</script>

<template>
  <!-- Loading State -->
  <div v-if="isLoading" class="flex flex-col items-center justify-center py-16">
    <div class="relative w-16 h-16">
      <div class="absolute top-0 left-0 w-full h-full border-4 border-blue-200 rounded-full"></div>
      <div class="absolute top-0 left-0 w-full h-full border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
    </div>
    <p class="mt-4 text-lg font-medium text-gray-700">Loading images...</p>
  </div>

  <!-- Image Gallery -->
  <div v-else-if="images.length" class="columns-2 md:columns-3 lg:col-span-4 xl:columns-5 gap-2">
    <div v-for="image in images" :key="image.url" class="relative group mb-4">
      <img :src="image.url"
           :alt="`${image.meta.filename} - ${image.meta.orientation} image ${image.meta.width}x${image.meta.height}`"
           class="w-full rounded-lg shadow-lg border border-white m-0!" />

      <div class="absolute bottom-0 left-0 right-0 rounded-bl-lg rounded-br-lg bg-black bg-opacity-50 text-white text-xs p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <div class="font-medium truncate">{{ image.meta.filename }}</div>
        <div>{{ image.meta.width }}x{{ image.meta.height }} ({{ image.meta.orientation }})</div>
      </div>
    </div>
  </div>
</template>