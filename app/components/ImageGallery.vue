<script lang='ts' setup>
const props = defineProps({
  images: {
    type: Array as () => File[],
    default: () => []
  }
});

interface ImageMeta {
  url: string;
  width: number;
  height: number;
  orientation: 'portrait' | 'landscape' | 'square';
}

const imageUrls = ref<ImageMeta[]>([]);

const getImageMetadata = (file: File): Promise<ImageMeta> => {
  return new Promise((resolve) => {
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
        width,
        height,
        orientation
      });
    };

    img.src = url;
  });
};

watch(
  () => props.images,
  async (newImages) => {
    // Cleanup old URLs
    imageUrls.value.forEach(meta => URL.revokeObjectURL(meta.url));

    // Create new URLs with metadata
    const metadataPromises = newImages.map(file => getImageMetadata(file));
    imageUrls.value = await Promise.all(metadataPromises);
  },
  { immediate: true }
);

// Cleanup при unmount
onUnmounted(() => {
  imageUrls.value.forEach(meta => URL.revokeObjectURL(meta.url));
});
</script>


<template>
  <div v-if="imageUrls.length" class="columns-2 md:columns-3 lg:col-span-4 xl:columns-5 gap-2">
    <div v-for="(imageMeta, index) in imageUrls" :key="index" class="group relative mb-2">
      <img :src="imageMeta.url"
           :alt="`${imageMeta.orientation} image ${imageMeta.width}x${imageMeta.height}`"
           class="w-full rounded-lg shadow-lg border border-white dark:border-black m-0!" />

      <div class="absolute bottom-0 left-0 right-0 rounded-bl-lg rounded-br-lg bg-black bg-opacity-50 text-white text-xs p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        {{ imageMeta.width }}x{{ imageMeta.height }} ({{ imageMeta.orientation }})
      </div>
    </div>
  </div>
</template>