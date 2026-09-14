<script lang='ts' setup>
import type { StampingOptions, StampingProgress } from '~/composables/useImageStamping';
import { useImageStamping } from '~/composables/useImageStamping';

/** The state a freshly loaded page is in. Named so resetAll cannot drift from it. */
const INITIAL_OPACITY = 100;
const INITIAL_ADD_FILENAME = true;

const selectedImages = ref<File[]>([]);
const selectedPngImage = ref<File | null>(null);
const stampOpacity = ref<number>(INITIAL_OPACITY);
const addFilenameToWatermark = ref<boolean>(INITIAL_ADD_FILENAME);
const stampedImages = ref<File[]>([]);
const isStamping = ref(false);
const stampingProgress = ref<StampingProgress>({ current: 0, total: 0, currentFileName: '' });
const isStampingComplete = ref(false);
const isSaving = ref(false);
const isSaved = ref(false);
const elapsedSeconds = ref<number | null>(null);

const { initialize, setStamp, applyStampToImages, downloadStampedImages } = useImageStamping();

const handleImagesSelected = (images: File[]) => {
  selectedImages.value = images
  stampedImages.value = []; // Reset stamped images when new images are selected
  isStampingComplete.value = false;
  isSaved.value = false;
};

const handleImagesReset = () => {
  selectedImages.value = [];
  stampedImages.value = [];
  isStampingComplete.value = false;
  isSaved.value = false;
};

const handlePngImageSelected = (image: File) => {
  selectedPngImage.value = image;
  isStampingComplete.value = false;
  isSaved.value = false;
};

const handlePngImageReset = () => {
  selectedPngImage.value = null;
  isStampingComplete.value = false;
  isSaved.value = false;
};

const handleOpacityChanged = (opacity: number) => {
  stampOpacity.value = opacity;
};

/**
 * Back to a just-loaded page: frames, stamp, results and settings all go.
 *
 * The object URLs behind the previews are revoked by ImageUploader and ImageGallery, which
 * both watch the arrays they are handed — emptying them here is what triggers that.
 *
 * Deliberately not guarded by a confirm: it only appears once a run has finished, next to
 * the download, where starting the next batch is the expected next move.
 */
const resetAll = () => {
  selectedImages.value = [];
  selectedPngImage.value = null;
  stampedImages.value = [];
  stampOpacity.value = INITIAL_OPACITY;
  addFilenameToWatermark.value = INITIAL_ADD_FILENAME;
  stampingProgress.value = { current: 0, total: 0, currentFileName: '' };
  isStamping.value = false;
  isStampingComplete.value = false;
  isSaving.value = false;
  isSaved.value = false;
  elapsedSeconds.value = null;
};

/**
 * One option set for the whole run, shared by setStamp and applyStampToImages so the stamp
 * is decoded under the same limits as the photos.
 *
 * Only the fields the UI actually drives are listed. Everything else — padding, the size
 * budget, the caption size and colour, the resize filter threshold — keeps the default
 * compiled into the WASM crate, and can be surfaced here as the UI grows without any change
 * on the Rust side.
 */
const stampingOptions = computed<StampingOptions>(() => ({
  format: 'jpg',
  quality: 75,
  opacity: stampOpacity.value,
  addFilename: addFilenameToWatermark.value
}));

const canAddStamp = computed(() => {
  return selectedImages.value.length > 0 && selectedPngImage.value !== null && !isStamping.value && !isStampingComplete.value;
});

const showSaveButton = computed(() => {
  return isStampingComplete.value && !isSaved.value;
});

const displayImages = computed(() => {
  return stampedImages.value.length > 0 ? stampedImages.value : selectedImages.value;
});

const progressPercent = computed(() => {
  const { current, total } = stampingProgress.value;

  return total > 0 ? Math.round((current / total) * 100) : 0;
});

const stampedSize = computed(() => stampedImages.value.reduce((sum, file) => sum + file.size, 0));

const galleryTitle = computed(() => (isStampingComplete.value ? 'Stamped gallery' : 'Gallery'));

/**
 * The one line that says where the run stands. Ordered by urgency, not by variable: the
 * first condition that holds is the one worth reading.
 */
const statusLabel = computed(() => {
  if (isStamping.value) return 'Stamping';
  if (isStampingComplete.value) return 'Done';
  if (selectedImages.value.length === 0) return 'Waiting for frames';
  if (!selectedPngImage.value) return 'Pick a stamp';

  return 'Ready to stamp';
});

const addStampToImages = async () => {
  if (!canAddStamp.value) {
    return;
  }

  isStamping.value = true;
  elapsedSeconds.value = null;
  stampingProgress.value = { current: 0, total: selectedImages.value.length, currentFileName: '' };

  const startedAt = performance.now();

  try {
    // Initialize the WASM module
    await initialize();

    // Set the stamp
    if (!selectedPngImage.value) {
      throw new Error('No stamp image selected');
    }
    await setStamp(selectedPngImage.value, stampingOptions.value);

    const results = await applyStampToImages(
      selectedImages.value,
      stampingOptions.value,
      (progress: StampingProgress) => {
        stampingProgress.value = progress;
      }
    );

    // Update the gallery with stamped images
    stampedImages.value = results.map((result: { file: File; originalName: string }) => result.file);

    // Mark stamping as complete
    elapsedSeconds.value = (performance.now() - startedAt) / 1000;
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

    // Always download as ZIP for all browsers
    await downloadStampedImages(results);
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
  <!-- The organic ground. Fixed, so it never repaints while a long gallery scrolls. -->
  <div class="blobs" aria-hidden="true"><i></i><i></i><i></i></div>

  <div class="relative z-10 mx-auto max-w-7xl px-5 pb-20">
    <AppHeader :format="stampingOptions.format ?? 'jpg'" :quality="stampingOptions.quality ?? 75" />

    <main>
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ImageUploader :selected-images="selectedImages"
                       :add-filename="addFilenameToWatermark"
                       @images-selected="handleImagesSelected"
                       @images-reset="handleImagesReset"
                       @update:add-filename="addFilenameToWatermark = $event" />

        <StampPicker :selected-image="selectedPngImage"
                     :opacity="stampOpacity"
                     @image-selected="handlePngImageSelected"
                     @image-reset="handlePngImageReset"
                     @opacity-changed="handleOpacityChanged" />
      </div>

      <!-- Where the run stands, and the one thing to do about it. -->
      <div class="panel mt-4 flex-row flex-wrap items-center justify-between gap-5 p-5">
        <div class="flex min-w-60 flex-1 flex-wrap items-center gap-4">
          <h2 class="text-xl font-bold">{{ statusLabel }}</h2>

          <template v-if="isStamping">
            <div class="size-5 flex-none animate-spin rounded-full border-3 border-teal/30 border-t-teal" role="status">
              <span class="sr-only">Stamping…</span>
            </div>

            <div class="flex max-w-md min-w-50 flex-1 flex-col gap-1.5">
              <div class="bar">
                <span :style="{ width: `${progressPercent}%` }"></span>
              </div>
              <p class="font-mono text-xs text-ink-2 tnum">
                {{ stampingProgress.current }} / {{ stampingProgress.total }} · {{ stampingProgress.currentFileName }}
              </p>
            </div>
          </template>

          <span v-else-if="isStampingComplete" class="chip chip-ok tnum">
            <span class="chip-dot"></span>
            {{ stampedImages.length }} frames stamped<template v-if="elapsedSeconds !== null"> in {{ elapsedSeconds.toFixed(1) }} s</template>
          </span>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <button v-if="!isStampingComplete"
                  type="button"
                  class="btn btn-primary btn-lg"
                  :disabled="!canAddStamp"
                  @click="addStampToImages">
            Apply stamp
          </button>

          <button v-if="showSaveButton"
                  type="button"
                  class="btn btn-secondary btn-lg"
                  :disabled="isSaving"
                  @click="saveStampedImages">
            <span v-if="isSaving" class="size-4 animate-spin rounded-full border-2 border-teal-ink/30 border-t-teal-ink"></span>
            {{ isSaving ? 'Zipping…' : `Download ZIP · ${formatFileSize(stampedSize)}` }}
          </button>

          <span v-if="isSaved" class="chip chip-ok">
            <span class="chip-dot"></span>
            ZIP downloaded
          </span>

          <button v-if="isStampingComplete"
                  type="button"
                  class="btn btn-quiet btn-lg"
                  @click="resetAll">
            Reset all
          </button>
        </div>
      </div>

      <ImageGallery :images="displayImages" :title="galleryTitle" :stamped="isStampingComplete" />
    </main>

    <footer class="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5 text-sm text-ink-3">
      <p class="flex items-center gap-2">
        <span aria-hidden="true">🖖</span> <span>Live long and prosper</span>
      </p>

      <p class="flex items-center gap-4">
        <a href="https://github.com/howbizarre" target="_blank" rel="noopener" class="transition-colors hover:text-ink" aria-label="GitHub">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8" />
          </svg>
        </a>

        <a href="https://x.com/howbizarre" target="_blank" rel="noopener" class="transition-colors hover:text-ink" aria-label="X">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M12.6.75h2.454l-5.36 6.142L16 15.25h-4.937l-3.867-5.07-4.425 5.07H.316l5.733-6.57L0 .75h5.063l3.495 4.633L12.601.75Zm-.86 13.028h1.36L4.323 2.145H2.865z" />
          </svg>
        </a>
      </p>
    </footer>
  </div>
</template>
