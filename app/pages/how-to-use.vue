<script lang='ts' setup>
/**
 * The long-form guide.
 *
 * Laid out as a zig-zag rather than a wall of text: every step is one paragraph and one
 * illustration, and the illustration is built from the same components the studio uses, so
 * a reader recognises a control before they reach it. Nothing here is a screenshot —
 * screenshots go stale, and they are wrong in one of the two themes.
 */
const wasmVersion = useRuntimeConfig().public.wasmVersion;

/** Live, so step 03 demonstrates the control instead of picturing it. */
const demoOpacity = ref(75);

const root = ref<HTMLElement | null>(null);

usePageSeo({
  title: 'How to use Add Stamp — the five-step guide',
  description: 'Bring in your frames, pick a PNG stamp, set the opacity, apply, and take the ZIP. The complete guide to batch watermarking with Add Stamp.',
  path: '/how-to-use'
});

/**
 * The same five steps, in the shape search engines read them. Kept next to the prose rather
 * than in a data file so a rewritten step is a one-place change — a HowTo that has drifted
 * from the page it describes is worse than no HowTo.
 */
useHead({
  script: [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: 'How to batch watermark photos with Add Stamp',
      description: 'Apply a PNG watermark to a whole folder of photos in the browser and download them as a ZIP.',
      totalTime: 'PT2M',
      tool: [{ '@type': 'HowToTool', name: 'A PNG stamp with transparency, up to 10 MB' }],
      step: [
        { '@type': 'HowToStep', name: 'Bring in the frames', text: 'Drop a folder of images onto the Frames panel, or pick them from disk. JPEG, PNG and WebP all read, up to 120 MP per frame.' },
        { '@type': 'HowToStep', name: 'Pick the mark', text: 'Choose a single PNG up to 10 MB. It is centred on every frame and scaled to fit with 10 px of clear space.' },
        { '@type': 'HowToStep', name: 'Dial the opacity', text: 'Set the stamp opacity with the four presets or the slider. The preview reacts as you move.' },
        { '@type': 'HowToStep', name: 'Apply the stamp', text: 'Press Apply stamp. Frames are processed one at a time and the progress line names the file in flight.' },
        { '@type': 'HowToStep', name: 'Take the batch', text: 'Save the frames straight into a folder you pick, or download the whole batch as one ZIP. Each file is JPEG at quality 75, named <original>_stamped.jpg.' }
      ]
    })
  }]
});

/**
 * Sections fade up as they arrive. Unobserved once seen, by design — a section that
 * re-animates every time it crosses the fold is a page that will not sit still while you
 * read it.
 */
onMounted(() => {
  if (!('IntersectionObserver' in window)) {
    document.documentElement.classList.add('no-reveal');
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        }
      });
    },
    { rootMargin: '0px 0px -12% 0px' }
  );

  root.value?.querySelectorAll('.reveal').forEach(element => observer.observe(element));

  onUnmounted(() => observer.disconnect());
});
</script>

<template>
  <div ref="root" class="flex flex-col gap-16 pb-8 sm:gap-20">
    <!-- ── Masthead of the guide ─────────────────────────────────────────── -->
    <section class="grid items-center gap-10 pt-2 lg:grid-cols-[1fr_1.05fr] lg:gap-14">
      <!-- The banner leads on a wide screen; on a narrow one the headline still comes
           first, because a page that opens on a picture of the output tells a first-time
           reader nothing about what they are looking at. -->
      <div class="lg:order-2">
        <p class="eyebrow">User guide</p>

        <h1 class="mt-3 text-4xl leading-[1.05] font-extrabold sm:text-5xl lg:text-6xl">
          A folder in,<br>a stamped ZIP out.
        </h1>

        <p class="mt-5 max-w-[56ch] text-lg leading-relaxed text-ink-2">
          Five steps, one screen. Your frames are decoded, stamped and re-encoded by a
          WebAssembly module running inside this tab — there is no upload, no account, and no
          server that ever sees a pixel.
        </p>

        <div class="mt-7 flex flex-wrap items-center gap-3">
          <NuxtLink to="/" class="btn btn-primary btn-lg">Open the studio</NuxtLink>
          <a href="#steps" class="btn btn-quiet btn-lg">Read the five steps</a>
        </div>

        <div class="mt-7 flex flex-wrap items-center gap-2">
          <span class="chip">
            <span class="chip-dot bg-teal!"></span>
            wasm v{{ wasmVersion }}
          </span>
          <span class="chip">jpg · q75</span>
          <span class="chip">&le; 120 MP per frame</span>
          <span class="chip">png stamp &le; 10 MB</span>
        </div>
      </div>

      <!-- What comes out: the mat, the print, the mark, the caption. -->
      <div class="mount p-4 shadow-e3 lg:order-1 sm:p-6">
        <div class="relative grid aspect-4/3 place-items-center overflow-hidden rounded-[10px] bg-linear-160 from-slate-500 via-slate-700 to-stone-800 shadow-[0_6px_24px_rgb(0_0_0/0.4)]">
          <span class="absolute top-6 -left-6 h-24 w-40 rotate-12 rounded-full bg-amber-200/25 blur-2xl" aria-hidden="true"></span>
          <span class="absolute right-4 bottom-10 h-20 w-32 -rotate-6 rounded-full bg-teal-200/20 blur-2xl" aria-hidden="true"></span>

          <span class="font-display text-2xl font-extrabold tracking-[0.3em] text-white/85 drop-shadow-[0_2px_10px_rgb(0_0_0/0.5)] sm:text-3xl">
            © STUDIO
          </span>

          <span class="absolute inset-x-0 bottom-3 text-center font-mono text-[0.6rem] text-white/50 sm:text-xs">
            DSC_4821.jpg
          </span>
        </div>

        <p class="mt-3 px-1 font-mono text-[0.68rem] text-neutral-600 dark:text-neutral-400">
          DSC_4821_stamped.jpg · 4000&times;6000 · jpg q75
        </p>
      </div>
    </section>

    <!-- ── The five steps ────────────────────────────────────────────────── -->
    <div id="steps" class="flex scroll-mt-8 flex-col gap-16 sm:gap-20">
      <GuideStep index="01" eyebrow="Step one" title="Bring in the frames">
        <p>
          Drop a folder&rsquo;s worth of images onto the
          <strong class="font-semibold text-ink">Frames</strong> panel, or click it and pick
          them from disk. JPEG, PNG and WebP all read, mixed together in one batch if that is
          what you have.
        </p>
        <p>
          The strip previews the first eight; the rest are counted, not decoded, so a
          hundred-frame batch does not cost you a hundred full-size previews before you have
          even chosen a stamp.
        </p>

        <template #points>
          <li>Total size and the largest file are listed under the strip.</li>
          <li>Clear drops the whole selection and starts over.</li>
          <li>Anything past 120 MP is refused from its header, before it is decoded.</li>
        </template>

        <template #visual>
          <div class="dropzone py-6">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="text-ink-3" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="3" />
              <circle cx="8.5" cy="9.5" r="1.6" />
              <path d="M3 16.5l4.5-4.2a2 2 0 0 1 2.7 0L15 17" />
              <path d="M14 14.2l1.6-1.5a2 2 0 0 1 2.7 0L21 15.4" />
            </svg>
            <p class="text-sm text-ink-2">
              Drop frames here or <span class="font-semibold text-teal-ink">pick them from disk</span>
            </p>
            <p class="font-mono text-xs text-ink-3">jpg · png · webp</p>
          </div>

          <div class="mount flex items-center gap-2 p-3">
            <span class="h-12 w-16 flex-none rounded-[5px] bg-linear-160 from-sky-300 to-slate-600" aria-hidden="true"></span>
            <span class="h-12 w-9 flex-none rounded-[5px] bg-linear-160 from-stone-300 to-stone-700" aria-hidden="true"></span>
            <span class="h-12 w-16 flex-none rounded-[5px] bg-linear-160 from-amber-200 to-rose-700" aria-hidden="true"></span>
            <span class="h-12 w-12 flex-none rounded-[5px] bg-linear-160 from-emerald-200 to-teal-800" aria-hidden="true"></span>
            <span class="flex-none px-1 font-mono text-xs text-neutral-500">+116</span>
          </div>

          <p class="kv">
            <span>Total</span>
            <span class="tnum">120 frames · 2.4 GB</span>
          </p>
        </template>
      </GuideStep>

      <span class="rail" aria-hidden="true"></span>

      <GuideStep index="02" eyebrow="Step two" title="Pick the mark" flip>
        <p>
          The stamp is a single <strong class="font-semibold text-ink">PNG</strong>, up to
          10 MB. PNG only, because it is the format that carries a real alpha channel — a
          JPEG logo would arrive with a white box around it.
        </p>
        <p>
          It is previewed on a checkerboard rather than on the mat: most stamps are white,
          and white on a pale surround shows you nothing. The checks are there so the
          transparency you are about to rely on is visible.
        </p>

        <template #points>
          <li>Centred on every frame, scaled to fit, with 10 px of clear space.</li>
          <li>One stamp per run — swap it with Remove and pick again.</li>
          <li>A .png name over non-PNG data is caught and explained.</li>
        </template>

        <template #visual>
          <div class="checker grid min-h-36 place-items-center rounded-card border border-mount-line p-4">
            <span class="font-display text-2xl font-extrabold tracking-[0.3em] text-white/90 drop-shadow-[0_2px_8px_rgb(0_0_0/0.45)]">
              © STUDIO
            </span>
          </div>

          <div class="flex flex-col gap-1.5">
            <p class="kv">
              <span>Size</span>
              <span class="tnum">1200&times;240 · 86.4 KB</span>
            </p>
            <p class="kv">
              <span>Position</span>
              <span>centred · contained with padding</span>
            </p>
          </div>
        </template>
      </GuideStep>

      <span class="rail" aria-hidden="true"></span>

      <GuideStep index="03" eyebrow="Step three" title="Dial the opacity">
        <p>
          Four presets and a slider. The swatches are filled with the coral they stand for,
          so 25&nbsp;% looks like 25&nbsp;% before you click it; the slider covers everything
          in between.
        </p>
        <p>
          The preview reacts as you move — which is the point. A mark at 100&nbsp;% signs the
          frame, a mark at 25&nbsp;% only whispers over it, and which one is right depends on
          the photograph, not on a number someone recommended.
        </p>

        <template #points>
          <li>The value applies to every frame in the batch.</li>
          <li>Try it here — this is the real control, not a picture of one.</li>
        </template>

        <template #visual>
          <div class="checker grid min-h-28 place-items-center rounded-card border border-mount-line p-4">
            <span class="font-display text-xl font-extrabold tracking-[0.3em] text-white drop-shadow-[0_2px_8px_rgb(0_0_0/0.45)]"
                  :style="{ opacity: Math.max(demoOpacity, 5) / 100 }">
              © STUDIO
            </span>
          </div>

          <OpacityPresets v-model="demoOpacity" />
        </template>
      </GuideStep>

      <span class="rail" aria-hidden="true"></span>

      <GuideStep index="04" eyebrow="Step four" title="Apply the stamp" flip>
        <p>
          <strong class="font-semibold text-ink">Apply stamp</strong> wakes up once both
          halves are filled. Frames go through one at a time, and the line under the bar names
          the one being worked on, so a batch that stalls tells you which file did it.
        </p>
        <p>
          Decide on the caption before you start: the switch under the frame strip writes each
          file&rsquo;s own name along its bottom edge, in grey at half opacity, sized to the
          frame so a small crop and a stitched panorama both stay readable.
        </p>

        <template #points>
          <li>Keep the tab in front — a backgrounded tab gets throttled by the browser.</li>
          <li>The finish line reports the frame count and the seconds it took.</li>
        </template>

        <template #visual>
          <div class="flex flex-wrap items-center gap-3">
            <h3 class="text-lg font-bold">Stamping</h3>
            <div class="size-5 flex-none animate-spin rounded-full border-3 border-teal/30 border-t-teal" aria-hidden="true"></div>
          </div>

          <div class="flex flex-col gap-1.5">
            <div class="bar bar-demo">
              <span style="width: 64%"></span>
            </div>
            <p class="font-mono text-xs text-ink-2 tnum">77 / 120 · DSC_4821.jpg</p>
          </div>

          <span class="chip chip-ok self-start tnum">
            <span class="chip-dot"></span>
            120 frames stamped in 8.4 s
          </span>
        </template>
      </GuideStep>

      <span class="rail" aria-hidden="true"></span>

      <GuideStep index="05" eyebrow="Step five" title="Take the batch">
        <p>
          The gallery turns into the stamped set, every frame ticked, and two ways out sit
          beside it. <strong class="font-semibold text-ink">Save to folder</strong> opens your
          file browser, and the frames are written into the folder you point at as loose
          files — nothing to unpack. <strong class="font-semibold text-ink">Download ZIP</strong>
          says what the archive weighs before you commit, and works in every browser.
        </p>
        <p>
          <strong class="font-semibold text-ink">Reset all</strong> returns the page to how it
          loaded: frames, stamp, results and settings all go, ready for the next folder. It is
          there from the moment anything changes, not only at the end of a run.
        </p>

        <template #points>
          <li>Saving to a folder needs Chrome, Edge or another Chromium browser; the ZIP does not.</li>
          <li>Inside the archive everything lands in a stamped-images/ folder.</li>
          <li>Output is JPEG at quality 75, named &lt;original&gt;_stamped.jpg.</li>
          <li>Hover a frame in the gallery for its dimensions and megapixels.</li>
        </template>

        <template #visual>
          <div class="mount grid grid-cols-4 gap-2 p-3">
            <span v-for="tone in ['from-sky-300 to-slate-600', 'from-stone-300 to-stone-700', 'from-amber-200 to-rose-700', 'from-emerald-200 to-teal-800']"
                  :key="tone"
                  class="relative block aspect-square rounded-[5px] bg-linear-160"
                  :class="tone"
                  aria-hidden="true">
              <span class="absolute top-1 right-1 grid size-4 place-items-center rounded-full bg-ok text-[0.5rem] text-white">&check;</span>
            </span>
          </div>

          <div class="flex flex-col gap-1.5">
            <p class="kv">
              <span>Archive</span>
              <span class="truncate">stamped-images-1758…zip</span>
            </p>
            <p class="kv">
              <span>Inside</span>
              <span>stamped-images/</span>
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <span class="btn btn-primary" aria-hidden="true">Save to folder…</span>
            <span class="btn btn-secondary" aria-hidden="true">Download ZIP · 214.7 MB</span>
          </div>
        </template>
      </GuideStep>
    </div>

    <!-- ── What the steps have no room for ───────────────────────────────── -->
    <section class="reveal">
      <p class="eyebrow">Good to know</p>
      <h2 class="mt-3 text-2xl font-extrabold sm:text-3xl">Six answers, before you ask them</h2>

      <div class="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div class="note-card">
          <h3>Nothing leaves the browser</h3>
          <p>
            The whole pipeline is a WebAssembly module fetched once and run locally. Work
            offline if you like — after the first load there is nothing left to reach for.
          </p>
        </div>

        <div class="note-card">
          <h3>Why JPEG comes out</h3>
          <p>
            Quality 75 is the sweet spot for a set meant to be sent on. JPEG has no alpha, so
            anything translucent is composited onto white before it is encoded.
          </p>
        </div>

        <div class="note-card">
          <h3>The filename caption</h3>
          <p>
            Optional, off the switch under the frame strip. Grey at 50&nbsp;% opacity, sized
            at 2.2&nbsp;% of the frame&rsquo;s shorter side and clamped between 16 and 96 px.
          </p>
        </div>

        <div class="note-card">
          <h3>Where the limits sit</h3>
          <p>
            120 MP and 65 535 px per frame, checked from the header before any buffer is
            allocated — that is what keeps a decompression bomb from taking the batch down.
          </p>
        </div>

        <div class="note-card">
          <h3>Large batches</h3>
          <p>
            Frames are processed one at a time, so memory stays flat however many you queue.
            Time scales with pixels, not with the number of files.
          </p>
        </div>

        <div class="note-card">
          <h3>Light or dark</h3>
          <p>
            The studio follows your system until you pick a side, then it remembers. Frames
            always sit on a hue-free grey, so the surround never shifts your white balance.
          </p>
        </div>
      </div>
    </section>

    <!-- ── The numbers, in one place ─────────────────────────────────────── -->
    <section class="reveal grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-14">
      <div>
        <p class="eyebrow">Under the hood</p>
        <h2 class="mt-3 text-2xl font-extrabold sm:text-3xl">The defaults, written down</h2>
        <p class="mt-3 max-w-[52ch] text-[0.95rem] leading-relaxed text-ink-2">
          Everything the interface does not ask you about. These are compiled into the Rust
          crate, so they read the same on every machine that loads the page.
        </p>
      </div>

      <div class="panel p-6">
        <dl class="flex flex-col gap-2.5">
          <div class="kv"><dt>Engine</dt><dd>wasm v{{ wasmVersion }} · Rust</dd></div>
          <div class="kv"><dt>Output</dt><dd>jpg · quality 75</dd></div>
          <div class="kv"><dt>Stamp padding</dt><dd class="tnum">10 px</dd></div>
          <div class="kv"><dt>Caption colour</dt><dd>#7d7d7d at 50 %</dd></div>
          <div class="kv"><dt>Max frame</dt><dd class="tnum">120 MP · 65 535 px</dd></div>
          <div class="kv"><dt>Max stamp</dt><dd class="tnum">10 MB png</dd></div>
          <div class="kv"><dt>Archive</dt><dd>zip · one folder, one pass</dd></div>
        </dl>
      </div>
    </section>

    <!-- ── Out ───────────────────────────────────────────────────────────── -->
    <section class="reveal panel items-center gap-5 p-10 text-center sm:p-14">
      <p class="eyebrow">That is the whole thing</p>
      <h2 class="max-w-[20ch] text-3xl font-extrabold sm:text-4xl">Go and put your mark on it.</h2>
      <p class="max-w-[46ch] text-[0.95rem] leading-relaxed text-ink-2">
        Drag a folder in and the first stamped frame is a few seconds away.
      </p>
      <NuxtLink to="/" class="btn btn-primary btn-lg mt-1">Open the studio</NuxtLink>
    </section>
  </div>
</template>
