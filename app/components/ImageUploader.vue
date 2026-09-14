<script lang='ts' setup>
interface Props {
  selectedImages?: File[];
  addFilename?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  selectedImages: () => [],
  addFilename: true
});

const emit = defineEmits(['images-selected', 'images-reset', 'update:addFilename']);

/** How many frames the filmstrip shows before it collapses into a count. */
const STRIP_LIMIT = 8;

const isDragOver = ref(false);
const previews = ref<{ url: string; name: string }[]>([]);

const hasSelectedImages = computed(() => props.selectedImages.length > 0);
const totalSize = computed(() => props.selectedImages.reduce((sum, file) => sum + file.size, 0));
const hiddenCount = computed(() => Math.max(0, props.selectedImages.length - STRIP_LIMIT));

const largestFile = computed(() => {
  return props.selectedImages.reduce<File | null>((largest, file) => {
    return !largest || file.size > largest.size ? file : largest;
  }, null);
});

const releasePreviews = () => {
  previews.value.forEach(preview => URL.revokeObjectURL(preview.url));
  previews.value = [];
};

/**
 * Only the first few frames get an object URL.
 *
 * The gallery below already decodes every selected image; handing the strip the whole set
 * would decode a second full-size copy of each one, which on a 120-frame batch is the
 * difference between a working tab and a dead one.
 */
watch(
  () => props.selectedImages,
  (images) => {
    releasePreviews();

    previews.value = images.slice(0, STRIP_LIMIT).map(file => ({
      url: URL.createObjectURL(file),
      name: file.name
    }));
  },
  { immediate: true }
);

onUnmounted(releasePreviews);

const resetImages = () => { emit('images-reset'); };

const handleFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement;

  if (target.files && target.files.length > 0) {
    emit('images-selected', Array.from(target.files));
  }

  // Clear the input so picking the same folder twice still fires.
  target.value = '';
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

<template>
  <section class="panel">
    <div class="panel-head">
      <h2>Frames</h2>

      <div class="flex flex-wrap items-center gap-2">
        <span v-if="hasSelectedImages" class="chip tnum">{{ selectedImages.length }} selected</span>
        <button v-if="hasSelectedImages"
                type="button"
                class="btn btn-danger"
                @click="resetImages">
          Clear
        </button>
      </div>
    </div>

    <div class="panel-body">
      <input id="file-upload"
             name="file-upload"
             type="file"
             class="sr-only"
             multiple
             accept="image/*"
             @change="handleFileChange">

      <!-- Empty: the dropzone is the whole panel body. -->
      <label v-if="!hasSelectedImages"
             for="file-upload"
             class="dropzone cursor-pointer"
             :class="{ 'is-dragover': isDragOver }"
             @drop="handleDrop"
             @dragover="handleDragOver"
             @dragenter="handleDragEnter"
             @dragleave="handleDragLeave">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="text-ink-3" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="3" />
          <circle cx="8.5" cy="9.5" r="1.6" />
          <path d="M3 16.5l4.5-4.2a2 2 0 0 1 2.7 0L15 17" />
          <path d="M14 14.2l1.6-1.5a2 2 0 0 1 2.7 0L21 15.4" />
        </svg>

        <p class="text-sm text-ink-2">
          Drop frames here or <span class="font-semibold text-teal-ink">pick them from disk</span>
        </p>
        <p class="font-mono text-xs text-ink-3">jpg · png · webp · up to 120 MP per frame</p>
      </label>

      <!-- Loaded: a filmstrip on the neutral mount, then the numbers. -->
      <template v-else>
        <div class="mount flex gap-2 overflow-x-auto p-3" aria-label="Selected frames">
          <img v-for="preview in previews"
               :key="preview.url"
               :src="preview.url"
               :alt="preview.name"
               class="h-14 w-auto flex-none rounded-[5px] shadow-[0_2px_8px_rgb(0_0_0/0.25)]">

          <span v-if="hiddenCount > 0" class="flex-none self-center px-2 font-mono text-xs text-neutral-500">
            +{{ hiddenCount }}
          </span>
        </div>

        <div class="flex flex-col gap-1.5">
          <p class="kv">
            <span>Total</span>
            <span class="tnum">{{ selectedImages.length }} frames · {{ formatFileSize(totalSize) }}</span>
          </p>
          <p v-if="largestFile" class="kv">
            <span>Largest</span>
            <span class="truncate">{{ largestFile.name }} · {{ formatFileSize(largestFile.size) }}</span>
          </p>
        </div>

        <label class="switch mt-auto" for="add-filename-watermark">
          <input id="add-filename-watermark"
                 type="checkbox"
                 :checked="props.addFilename"
                 @change="$emit('update:addFilename', ($event.target as HTMLInputElement).checked)">
          <span class="switch-track"></span>
          <span>Write the filename under each frame</span>
        </label>
      </template>
    </div>
  </section>
</template>
