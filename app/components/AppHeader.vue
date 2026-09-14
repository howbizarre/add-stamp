<script lang='ts' setup>
interface Props {
  format: string;
  quality: number;

  /**
   * Mirrors `defaults::MAX_MEGAPIXELS` in wasm/src/lib.rs. Shown so a frame refused by the
   * decoder is explained before it is refused, not after.
   */
  maxMegapixels?: number;
}

const props = withDefaults(defineProps<Props>(), { maxMegapixels: 120 });

const { theme, toggle } = useTheme();
const wasmVersion = useRuntimeConfig().public.wasmVersion;

const outputLabel = computed(() => `${props.format} · q${props.quality}`);
</script>

<template>
  <header class="flex flex-wrap items-end justify-between gap-6 pt-9 pb-6">
    <div class="flex items-center gap-4">
      <div class="grid size-12 flex-none place-items-center rounded-2xl bg-linear-145 from-coral to-amber-400 shadow-e2" aria-hidden="true">
        <span class="font-display text-xl leading-none font-extrabold text-white">AS</span>
      </div>

      <div>
        <h1 class="text-3xl leading-none font-extrabold sm:text-4xl">Add Stamp</h1>
        <p class="mt-1 text-sm text-ink-2">Put your mark on a whole folder of frames. Nothing leaves the browser.</p>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <span class="chip">
        <span class="chip-dot bg-teal!"></span>
        wasm v{{ wasmVersion }}
      </span>
      <span class="chip">{{ outputLabel }}</span>
      <span class="chip">&le; {{ maxMegapixels }} MP</span>

      <!-- Below sm the label goes to screen readers only, so the control collapses to its
           icon rather than pushing the chip row onto a third line. -->
      <button type="button"
              class="btn btn-quiet max-sm:px-3"
              @click="toggle">
        <svg v-if="theme === 'dark'" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
        <svg v-else xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
        </svg>
        <span class="max-sm:sr-only">{{ theme === 'dark' ? 'Light' : 'Dark' }}</span>
      </button>
    </div>
  </header>
</template>
