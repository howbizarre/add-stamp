<script lang='ts' setup>
interface Props {
  selectedImage?: File | null;
  opacity?: number;
}

interface ImageMetadata {
  width: number;
  height: number;
}

const props = withDefaults(defineProps<Props>(), {
  selectedImage: null,
  opacity: 75
});

const emit = defineEmits(['image-selected', 'image-reset', 'opacity-changed']);

/** Mirrors the check in validatePngFile below — one number, shown and enforced. */
const MAX_STAMP_BYTES = 10 * 1024 * 1024;

const isDragOver = ref(false);
const imagePreviewUrl = ref<string | null>(null);
const imageMetadata = ref<ImageMetadata | null>(null);
const errorMessage = ref<string>('');

/**
 * The parent owns the value; this is only a conduit, so there is no second copy to drift.
 */
const opacity = computed({
  get: () => props.opacity,
  set: (value: number) => emit('opacity-changed', value)
});

watch(
  () => props.selectedImage,
  async (newImage) => {
    if (imagePreviewUrl.value) {
      URL.revokeObjectURL(imagePreviewUrl.value);
      imagePreviewUrl.value = null;
    }

    imageMetadata.value = null;
    errorMessage.value = '';

    if (newImage) {
      imagePreviewUrl.value = URL.createObjectURL(newImage);

      try {
        imageMetadata.value = await getImageMetadata(newImage);
      } catch (error) {
        console.error('Error loading image metadata:', error);
      }
    }
  },
  { immediate: true }
);

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
  if (!file.name.toLowerCase().endsWith('.png')) {
    errorMessage.value = `${file.name} is not a PNG. Export the stamp as PNG so its transparency survives.`;
    return false;
  }

  if (file.type !== 'image/png') {
    errorMessage.value = `${file.name} has a .png name but is not PNG data. Re-export it from your editor.`;
    return false;
  }

  if (file.size > MAX_STAMP_BYTES) {
    errorMessage.value = `${formatFileSize(file.size)} is over the ${formatFileSize(MAX_STAMP_BYTES)} limit. Scale the stamp down — it is resized to the frame anyway.`;
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

const getImageMetadata = (file: File): Promise<ImageMetadata> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
};
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2>Stamp</h2>

      <div class="flex min-w-0 flex-wrap items-center gap-2">
        <span v-if="selectedImage" class="chip max-w-52">
          <span class="truncate">{{ selectedImage.name }}</span>
        </span>
        <button v-if="selectedImage"
                type="button"
                class="btn btn-danger"
                @click="resetImage">
          Remove
        </button>
      </div>
    </div>

    <div class="panel-body">
      <input id="png-upload"
             name="png-upload"
             type="file"
             class="sr-only"
             accept=".png,image/png"
             @change="handleFileChange">

      <label v-if="!selectedImage"
             for="png-upload"
             class="dropzone cursor-pointer"
             :class="{ 'is-dragover': isDragOver }"
             @drop="handleDrop"
             @dragover="handleDragOver"
             @dragenter="handleDragEnter"
             @dragleave="handleDragLeave">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="text-ink-3" aria-hidden="true">
          <path d="M12 3v9" />
          <path d="M8.5 8.5 12 12l3.5-3.5" />
          <rect x="3" y="14" width="18" height="7" rx="2.5" />
        </svg>

        <p class="text-sm text-ink-2">
          Drop your stamp or <span class="font-semibold text-teal-ink">pick a PNG</span>
        </p>
        <p class="font-mono text-xs text-ink-3">png with transparency · up to {{ formatFileSize(MAX_STAMP_BYTES) }}</p>
      </label>

      <template v-else>
        <!-- Checkerboard, not the mat: a white stamp on a light surround is invisible, and
             the alpha channel is the thing worth seeing here. -->
        <div class="checker grid min-h-32 place-items-center rounded-card border border-mount-line p-4">
          <img v-if="imagePreviewUrl"
               :src="imagePreviewUrl"
               :alt="selectedImage.name"
               class="max-h-24 max-w-full object-contain"
               :style="{ opacity: Math.max(opacity, 5) / 100 }">
        </div>

        <OpacityPresets v-model="opacity" />

        <div class="mt-auto flex flex-col gap-1.5">
          <p v-if="imageMetadata" class="kv">
            <span>Size</span>
            <span class="tnum">{{ imageMetadata.width }}&times;{{ imageMetadata.height }} · {{ formatFileSize(selectedImage.size) }}</span>
          </p>
          <p class="kv">
            <span>Position</span>
            <span>bottom right · contained with padding</span>
          </p>
        </div>
      </template>

      <p v-if="errorMessage" class="rounded-card border border-crit/25 bg-crit/8 p-3 text-sm text-crit">
        {{ errorMessage }}
      </p>
    </div>
  </section>
</template>
