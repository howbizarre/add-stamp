import tailwindcss from "@tailwindcss/vite";

// The wasm artifact is published to /wasm/v<version>/, so the client needs the version to
// build its import URL. Read from package.json rather than duplicated here, which is also
// what scripts/build-wasm.mjs does when it writes the directory.
import { version } from "./package.json";

/**
 * Sets the theme class before first paint.
 *
 * With ssr: false the shell is a static index.html, so this runs while the page is still
 * blank — without it the app would flash the light palette on every load for anyone on a
 * dark OS, which is most of the audience.
 */
const themeBoot = `try{var t=localStorage.getItem('add-stamp:theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.classList.toggle('dark',t==='dark')}catch(e){}`;

export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],

  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'Add Stamp — batch watermarking in the browser',
      meta: [
        { name: 'description', content: 'Put your mark on a whole folder of frames. Nothing leaves the browser.' },
        // Both palettes are declared so the browser chrome matches whichever theme is live.
        { name: 'theme-color', content: '#f2ebe0', media: '(prefers-color-scheme: light)' },
        { name: 'theme-color', content: '#15171a', media: '(prefers-color-scheme: dark)' }
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Figtree:wght@400;500;600;800&family=IBM+Plex+Mono:wght@400;500&display=swap'
        }
      ],
      script: [{ innerHTML: themeBoot, tagPosition: 'head' }]
    }
  },

  runtimeConfig: {
    public: {
      wasmVersion: version
    }
  },

  vite: {
    plugins: [tailwindcss()]
  },

  nitro: {
    preset: 'cloudflare_module',

    cloudflare: {
      deployConfig: true,
      nodeCompat: true
    },

    // Add proper headers for WASM files.
    //
    // The patterns are '**' rather than '*' because the artifact now lives one directory
    // down, in /wasm/v<version>/, which a single-segment wildcard would not match.
    //
    // That versioned directory is also what makes immutable caching safe: the glue JS and
    // its .wasm move as a pair, so a browser can never pair a cached glue from one deploy
    // with the .wasm from the next — a wasm-bindgen schema error that is very hard to
    // diagnose in the field.
    routeRules: {
      '/wasm/**/*.wasm': {
        headers: {
          'Content-Type': 'application/wasm',
          'Cache-Control': 'public, max-age=31536000, immutable'
        }
      },
      '/wasm/**/*.js': {
        headers: {
          'Content-Type': 'application/javascript',
          'Cache-Control': 'public, max-age=31536000, immutable'
        }
      }
    }
  },

  modules: ['nitro-cloudflare-dev']
});
