<script lang='ts' setup>
/**
 * The masthead. Deliberately thin: identity, the way out to the guide, the theme.
 *
 * The build chips that used to sit here (wasm version, output format, megapixel ceiling)
 * moved to the guide's "under the hood" panel. They are reference, not controls, and a
 * masthead that reads as a status bar makes the one real action on the page harder to find.
 */
const route = useRoute();
const { toggle } = useTheme();

/** On the home page the wordmark is the page's h1; elsewhere it is only the way back. */
const isHome = computed(() => route.path === '/');
</script>

<template>
  <header class="flex flex-wrap items-end justify-between gap-6 pt-9 pb-6">
    <NuxtLink to="/" class="group flex items-center gap-4 rounded-2xl no-underline">
      <div class="grid size-12 flex-none place-items-center rounded-2xl bg-linear-145 from-coral to-amber-400 shadow-e2 transition-transform duration-200 ease-soft group-hover:-rotate-6" aria-hidden="true">
        <span class="font-display text-xl leading-none font-extrabold text-white">AS</span>
      </div>

      <div>
        <component :is="isHome ? 'h1' : 'p'" class="font-display text-3xl leading-none font-extrabold tracking-[-0.02em] sm:text-4xl">
          Add Stamp
        </component>
        <p class="mt-1 text-sm text-ink-2">Put your mark on a whole folder of frames. Nothing leaves the browser.</p>
      </div>
    </NuxtLink>

    <!-- Below sm the pair takes its own row and pushes to both edges: the way out of the
         page on the left, the theme under the thumb on the right. Above it they stay a
         tight pair at the end of the masthead. -->
    <div class="flex flex-wrap items-center gap-2 max-sm:w-full max-sm:justify-between">
      <!-- One link, pointing away from wherever you are. -->
      <NuxtLink v-if="isHome" to="/how-to-use" class="btn btn-quiet">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M9.6 9.3a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.8-.9 1.4v.4" />
          <path d="M12 17h.01" />
        </svg>
        How to use
      </NuxtLink>

      <NuxtLink v-else to="/" class="btn btn-quiet">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M19 12H5" />
          <path d="m11 18-6-6 6-6" />
        </svg>
        Back to the studio
      </NuxtLink>

      <!-- Which way the control points is decided by CSS, not by state. The pages are
           prerendered, so a `theme === 'dark'` test here would bake one answer into the
           static HTML and then contradict it on hydration; the `dark:` variant is already
           right in the served markup, before any script has run.

           Below sm the label goes to screen readers only, so the control collapses to its
           icon rather than pushing the row onto a second line. -->
      <button type="button"
              class="btn btn-quiet max-sm:px-3"
              @click="toggle">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" class="hidden dark:block" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="block dark:hidden" aria-hidden="true">
          <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
        </svg>
        <span class="max-sm:sr-only"><span class="hidden dark:inline">Light</span><span class="dark:hidden">Dark</span></span>
      </button>
    </div>
  </header>
</template>
