<script lang='ts' setup>
/**
 * Stamp opacity as four swatches plus a slider.
 *
 * The presets carry their own value in their fill, so the row reads as a scale rather than
 * as four identical buttons — picked up from the colour-dot rows in the reference designs.
 * The slider stays for the values in between.
 */
interface Props {
  modelValue: number;
}

const props = defineProps<Props>();
const emit = defineEmits<{ 'update:modelValue': [value: number] }>();

const PRESETS = [25, 50, 75, 100] as const;

const clamp = (value: number) => Math.min(100, Math.max(1, Math.round(value)));

const set = (value: number) => emit('update:modelValue', clamp(value));

const onSlide = (event: Event) => set(Number((event.target as HTMLInputElement).value));

/** Presets fill with the coral they stand for, so 25 % looks like 25 %. */
const swatch = (value: number) => ({
  backgroundColor: `color-mix(in srgb, var(--color-coral) ${value}%, var(--color-surface-2))`,
  color: value >= 60 ? '#fff' : 'var(--color-ink-2)'
});
</script>

<template>
  <div class="flex flex-col gap-3">
    <p class="eyebrow">Stamp opacity</p>

    <div class="flex flex-wrap items-center gap-2.5">
      <button v-for="preset in PRESETS"
              :key="preset"
              type="button"
              class="grid size-9 cursor-pointer place-items-center rounded-full border-2 border-transparent font-mono text-[0.64rem] shadow-e1 transition-transform duration-150 ease-soft hover:-translate-y-0.5"
              :class="{ 'border-ink!': props.modelValue === preset }"
              :style="swatch(preset)"
              :aria-pressed="props.modelValue === preset"
              :aria-label="`Set opacity to ${preset} percent`"
              @click="set(preset)">
        {{ preset }}
      </button>

      <input id="stamp-opacity"
             class="range"
             type="range"
             min="1"
             max="100"
             :value="props.modelValue"
             aria-label="Stamp opacity"
             @input="onSlide">

      <span class="chip tnum">{{ props.modelValue }}%</span>
    </div>
  </div>
</template>
