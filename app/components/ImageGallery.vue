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

interface Props {
  images?: File[];
  title?: string;
  stamped?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  images: () => [],
  title: 'Gallery',
  stamped: false
});

const images = ref<Image[]>([]);
const isLoading = ref(false);

const megapixels = (image: Image) => (image.meta.width * image.meta.height / 1e6).toFixed(1);

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
        meta: { width, height, orientation, filename: file.name }
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
  <!-- The mat stops here. Frames sit on a hue-free ground so nothing shifts how their
       white balance reads. -->
  <section class="mount mt-4 rounded-panel p-4">
    <header class="mb-3.5 flex flex-wrap items-center justify-between gap-3 px-1">
      <h2 class="font-mono text-xs tracking-widest text-neutral-600 uppercase dark:text-neutral-400">
        {{ props.title }}
      </h2>
      <span v-if="images.length" class="font-mono text-xs text-neutral-600 tnum dark:text-neutral-400">
        {{ images.length }} {{ images.length === 1 ? 'frame' : 'frames' }}
      </span>
    </header>

    <!-- Loading -->
    <div v-if="isLoading" class="flex flex-col items-center justify-center py-16">
      <div class="size-10 animate-spin rounded-full border-3 border-neutral-400/40 border-t-neutral-200"></div>
      <p class="mt-4 font-mono text-xs text-neutral-400">Reading frames…</p>
    </div>

    <!-- Frames -->
    <div v-else-if="images.length" class="columns-2 gap-3 sm:columns-3 lg:columns-4 xl:columns-5">
      <div v-for="image in images"
           :key="image.url"
           class="group relative mb-3 break-inside-avoid overflow-hidden rounded-lg shadow-[0_3px_14px_rgb(0_0_0/0.3)] focus-within:ring-2 focus-within:ring-coral"
           tabindex="0">
        <img :src="image.url"
             :alt="`${image.meta.filename} — ${image.meta.orientation}, ${image.meta.width} by ${image.meta.height} pixels`"
             class="block w-full">

        <span v-if="props.stamped"
              class="absolute top-2 right-2 grid size-5 place-items-center rounded-full bg-ok text-[0.62rem] text-white shadow-[0_2px_6px_rgb(0_0_0/0.4)]"
              aria-hidden="true">&check;</span>

        <div class="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/75 to-transparent p-2.5 font-mono text-[0.66rem] leading-snug text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
          <p class="truncate">{{ image.meta.filename }}</p>
          <p class="tnum">{{ image.meta.width }}&times;{{ image.meta.height }} · {{ megapixels(image) }} MP · {{ image.meta.orientation }}</p>
        </div>
      </div>
    </div>

    <!-- Nothing yet -->
    <div v-else class="px-5 py-14 text-center">
      <p class="font-display text-lg font-bold text-neutral-500 dark:text-neutral-400">No frames yet</p>
      <p class="mt-1.5 text-sm text-neutral-600 dark:text-neutral-500">Pick images above and they will show up here.</p>
    </div>
  </section>
</template>
