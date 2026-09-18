<script lang='ts' setup>
/**
 * One step of the guide: a column of prose and a column of illustration, swapping sides
 * down the page.
 *
 * The swap is `order` on the large breakpoint only. Below it the two columns stack, and the
 * prose always comes first — a reader on a phone wants the sentence before the picture, and
 * source order is also what a screen reader follows.
 */
interface Props {
  index: string;
  eyebrow: string;
  title: string;

  /** Put the illustration on the left instead of the right. */
  flip?: boolean;
}

withDefaults(defineProps<Props>(), { flip: false });
</script>

<template>
  <section class="reveal grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
    <div :class="flip ? 'lg:order-2' : ''">
      <div class="flex items-baseline gap-4">
        <span class="step-index" aria-hidden="true">{{ index }}</span>
        <p class="eyebrow">{{ eyebrow }}</p>
      </div>

      <h2 class="mt-4 text-2xl font-extrabold sm:text-3xl">{{ title }}</h2>

      <div class="mt-3 flex max-w-[58ch] flex-col gap-3 text-[0.95rem] leading-relaxed text-ink-2">
        <slot />
      </div>

      <ul v-if="$slots.points" class="mt-5 flex flex-col gap-2 border-l-2 border-line pl-4 font-mono text-xs leading-relaxed text-ink-3">
        <slot name="points" />
      </ul>
    </div>

    <div :class="flip ? 'lg:order-1' : ''">
      <div class="step-figure">
        <slot name="visual" />
      </div>
    </div>
  </section>
</template>
