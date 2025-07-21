<script lang='ts' setup>
const selectedImages = ref<File[]>([]);

const handleImagesSelected = (images: File[]) => {
  selectedImages.value = images
};

const handleImagesReset = () => {
  selectedImages.value = [];
};
</script>

<template>
  <div class="container mx-auto p-4 sm:p-6 lg:p-8">
    <header class="text-center mb-8">
      <h1 class="text-4xl font-bold text-gray-800">My Photo Gallery</h1>
      <p class="text-lg text-gray-600">Upload and browse your photos</p>
    </header>

    <main class="mx-auto bg-white p-6 rounded-lg">
      <div class="mb-8">
        <ImageUploader :selected-images="selectedImages"
                       @images-selected="handleImagesSelected"
                       @images-reset="handleImagesReset" />
      </div>

      <ImageGallery :images="selectedImages" />
    </main>
  </div>
</template>