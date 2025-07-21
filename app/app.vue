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
      <!-- Multiple Images Uploader -->
      <section>
        <h2 class="text-2xl font-semibold text-gray-700 mb-4">Multiple Images Gallery</h2>
        <div class="mb-8">
          <ImageUploader :selected-images="selectedImages"
                         @images-selected="handleImagesSelected"
                         @images-reset="handleImagesReset" />
        </div>

        <ImageGallery :images="selectedImages" />
      </section>

      <!-- Divider -->
      <hr class="border-gray-200">

      <!-- Single PNG Picker -->
      <section>
        <h2 class="text-2xl font-semibold text-gray-700 mb-4">Single PNG Image Picker</h2>
        <div class="max-w-2xl mx-auto">
          <SinglePngPicker :selected-image="selectedPngImage"
                           @image-selected="handlePngImageSelected"
                           @image-reset="handlePngImageReset" />
        </div>
      </section>
    </main>
  </div>
</template>