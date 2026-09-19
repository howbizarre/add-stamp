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

/** Which save is running, if any: the two buttons share a disabled state but not a spinner. */
const savingMode = ref<'zip' | 'folder' | null>(null);
const saveProgress = ref<StampingProgress>({ current: 0, total: 0, currentFileName: '' });

/** What the last successful save did, in the words the chip shows. Null until one lands. */
const saveNotice = ref<string | null>(null);

/** Only Chromium has a folder picker, and only `window` can say so — hence onMounted. */
const canPickFolder = ref(false);
const elapsedSeconds = ref<number | null>(null);

const { initialize, setStamp, applyStampToImages, downloadStampedImages, saveStampedImagesToFolder, canSaveToFolder } = useImageStamping();

onMounted(() => {
  canPickFolder.value = canSaveToFolder();
});

usePageSeo({
  title: 'Add Stamp — batch watermark photos in your browser',
  description: 'Drop a folder of photos, stamp every one with your PNG mark and download the ZIP. Runs entirely in your browser — no upload, no account, free.',
  path: '/'
});

/**
 * Tells search engines what the page is rather than leaving them to infer it from the
 * markup of a tool with an empty dropzone. `price: 0` is what earns the free label in a
 * result; without an offer the software is assumed paid.
 */
useHead({
  script: [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Add Stamp',
      url: useRuntimeConfig().public.siteUrl,
      applicationCategory: 'MultimediaApplication',
      operatingSystem: 'Any browser with WebAssembly',
      browserRequirements: 'Requires WebAssembly',
      description: 'Batch watermarking in the browser. Apply a PNG stamp to a whole folder of photos and download them as a ZIP, without uploading anything.',
      offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
      license: 'https://opensource.org/licenses/MIT',
      author: { '@type': 'Person', name: 'howbizarre', url: 'https://github.com/howbizarre' },
      featureList: [
        'Batch watermarking of an entire folder',
        'PNG stamps with transparency',
        'Adjustable stamp opacity',
        'Optional filename caption on each frame',
        'Download as a single ZIP',
        'Runs offline — no upload'
      ]
    })
  }]
});

const handleImagesSelected = (images: File[]) => {
  selectedImages.value = images
  stampedImages.value = []; // Reset stamped images when new images are selected
  isStampingComplete.value = false;
  saveNotice.value = null;
};

const handleImagesReset = () => {
  selectedImages.value = [];
  stampedImages.value = [];
  isStampingComplete.value = false;
  saveNotice.value = null;
};

const handlePngImageSelected = (image: File) => {
  selectedPngImage.value = image;
  isStampingComplete.value = false;
  saveNotice.value = null;
};

const handlePngImageReset = () => {
  selectedPngImage.value = null;
  isStampingComplete.value = false;
  saveNotice.value = null;
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
 * Deliberately not guarded by a confirm: it does the same as the two Clear buttons on the
 * panels above, which ask nothing either, and nothing it wipes takes more than a re-pick to
 * get back — the stamped frames themselves are the one exception, and while they exist the
 * save buttons sit right beside it.
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
  savingMode.value = null;
  saveProgress.value = { current: 0, total: 0, currentFileName: '' };
  saveNotice.value = null;
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

/**
 * Anything at all moved away from a freshly loaded page — which is exactly when Reset all
 * has something to undo, and so exactly when it is worth showing. Settings count: an opacity
 * dragged to 30 and a caption switched off are as much work to redo as a folder re-picked.
 */
const isDirty = computed(() => {
  return selectedImages.value.length > 0
    || selectedPngImage.value !== null
    || stampedImages.value.length > 0
    || stampOpacity.value !== INITIAL_OPACITY
    || addFilenameToWatermark.value !== INITIAL_ADD_FILENAME;
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

/** The results in the shape both save paths take. */
const stampedResults = () => stampedImages.value.map(file => ({
  file,
  originalName: file.name.replace(/_stamped\.(jpg|webp)$/, '')
}));

const saveStampedImages = async () => {
  if (stampedImages.value.length === 0) {
    return;
  }

  savingMode.value = 'zip';

  try {
    // The one path every browser has, folder picker or not.
    await downloadStampedImages(stampedResults());
    saveNotice.value = 'ZIP downloaded';
  } catch (error) {
    console.error('Error saving stamped images:', error);
    alert(`Error saving images: ${error}`);
  } finally {
    savingMode.value = null;
  }
};

/**
 * Writes the frames into a folder the user points at, as loose files.
 *
 * Only offered where `canPickFolder` says the browser has a picker; everywhere else the ZIP
 * is the only button on screen.
 */
const saveStampedImagesToDisk = async () => {
  if (stampedImages.value.length === 0) {
    return;
  }

  savingMode.value = 'folder';
  saveProgress.value = { current: 0, total: stampedImages.value.length, currentFileName: '' };

  try {
    const result = await saveStampedImagesToFolder(stampedResults(), {
      onProgress: (progress: StampingProgress) => {
        saveProgress.value = progress;
      },
      onConflict: (names: string[]) => {
        const shown = names.slice(0, 5).join('\n');
        const rest = names.length > 5 ? `\n…and ${names.length - 5} more` : '';

        return confirm(`That folder already holds ${names.length} file(s) with these names:\n\n${shown}${rest}\n\nSaving replaces them. Continue?`);
      }
    });

    // Null is the overwrite prompt declined; the picker's own cancel throws instead.
    if (result) {
      saveNotice.value = `${result.written} frames saved to ${result.directoryName}`;
    }
  } catch (error) {
    // Dismissing the picker is a decision, not a fault — say nothing about it.
    if (error instanceof DOMException && error.name === 'AbortError') {
      return;
    }

    console.error('Error saving stamped images to folder:', error);
    alert(`Error saving images: ${error}`);
  } finally {
    savingMode.value = null;
    saveProgress.value = { current: 0, total: 0, currentFileName: '' };
  }
};
</script>

<template>
  <div>
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

        <button v-if="isStampingComplete && canPickFolder"
                type="button"
                class="btn btn-primary btn-lg"
                :disabled="savingMode !== null"
                @click="saveStampedImagesToDisk">
          <span v-if="savingMode === 'folder'" class="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white"></span>
          <span class="tnum">{{ savingMode === 'folder' ? `Saving ${saveProgress.current} / ${saveProgress.total}…` : 'Save to folder…' }}</span>
        </button>

        <button v-if="isStampingComplete"
                type="button"
                class="btn btn-secondary btn-lg"
                :disabled="savingMode !== null"
                @click="saveStampedImages">
          <span v-if="savingMode === 'zip'" class="size-4 animate-spin rounded-full border-2 border-teal-ink/30 border-t-teal-ink"></span>
          {{ savingMode === 'zip' ? 'Zipping…' : `Download ZIP · ${formatFileSize(stampedSize)}` }}
        </button>

        <span v-if="saveNotice" class="chip chip-ok tnum">
          <span class="chip-dot"></span>
          {{ saveNotice }}
        </span>

        <!-- Shown the moment the page differs from how it loaded, not only at the end of a run. -->
        <button v-if="isDirty"
                type="button"
                class="btn btn-quiet btn-lg"
                :disabled="isStamping || savingMode !== null"
                @click="resetAll">
          Reset all
        </button>
      </div>
    </div>

    <ImageGallery :images="displayImages" :title="galleryTitle" :stamped="isStampingComplete" />
  </div>
</template>
