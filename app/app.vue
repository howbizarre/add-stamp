<script lang='ts' setup>
const selectedImages = ref<File[]>([]);
const selectedPngImage = ref<File | null>(null);

const handleImagesSelected = (images: File[]) => {
  selectedImages.value = images
};

const handleImagesReset = () => {
  selectedImages.value = [];
};

const handlePngImageSelected = (image: File) => {
  selectedPngImage.value = image;
};

const handlePngImageReset = () => {
  selectedPngImage.value = null;
};
</script>

<template>
  <div class="container mx-auto p-4 sm:p-6 lg:p-8">
    <header class="text-center mb-8">
      <h1 class="text-4xl font-bold text-gray-800">My Photo Gallery</h1>
      <p class="text-lg text-gray-600">Upload and browse your photos</p>
    </header>

    <main class="mx-auto bg-white p-6 rounded-lg space-y-8">
      <!-- Upload Section -->
      <section>
        <h2 class="text-2xl font-semibold text-gray-700 mb-4">Upload Files</h2>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Multiple Images Uploader -->
          <div>
            <h3 class="text-lg font-medium text-gray-600 mb-3">Multiple Images Gallery</h3>
            <ImageUploader :selected-images="selectedImages"
                           @images-selected="handleImagesSelected"
                           @images-reset="handleImagesReset" />
          </div>

          <!-- Stamp Picker -->
          <div>
            <h3 class="text-lg font-medium text-gray-600 mb-3">Stamp Picker (PNG only)</h3>
            <StampPicker :selected-image="selectedPngImage"
                         @image-selected="handlePngImageSelected"
                         @image-reset="handlePngImageReset" />
          </div>
        </div>
      </section>

      <!-- Divider -->
      <hr class="border-gray-200">

      <!-- Gallery Section -->
      <section>
        <h2 class="text-2xl font-semibold text-gray-700 mb-4">Gallery</h2>
        <ImageGallery :images="selectedImages" />
      </section>
    </main>
  </div>
</template>