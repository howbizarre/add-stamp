<script lang='ts' setup>
interface Image {
  url: string;
  meta: {
    width: number;
    height: number;
    orientation: 'portrait' | 'landscape' | 'square';
  };
}

const props = defineProps({ images: Array as () => File[] });
const images = ref<Image[]>([]);

const getImageMetadata = (file: File): Promise<Image> => {
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
        meta: {
          width,
          height,
          orientation
        }
      });
    };

    img.src = url;
  });
};

watch(
  () => props.images,
  async (newImages) => {
    images.value.forEach(meta => URL.revokeObjectURL(meta.url));
    const metadataPromises = (newImages ?? []).map(file => getImageMetadata(file));
    images.value = await Promise.all(metadataPromises);
  },
  { immediate: true }
);

onUnmounted(() => {
  images.value.forEach(meta => URL.revokeObjectURL(meta.url));
});
</script>

<template>
  <div v-if="images.length" class="columns-2 md:columns-3 lg:col-span-4 xl:columns-5 gap-2">
    <div v-for="image in images" :key="image.url" class="relative group mb-4">
      <img :src="image.url"
           :alt="`${image.meta.orientation} image ${image.meta.width}x${image.meta.height}`"
           class="w-full rounded-lg shadow-lg border border-white m-0!" />

      <div class="absolute bottom-0 left-0 right-0 rounded-bl-lg rounded-br-lg bg-black bg-opacity-50 text-white text-xs p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        {{ image.meta.width }}x{{ image.meta.height }} ({{ image.meta.orientation }})
      </div>
    </div>
  </div>
</template>