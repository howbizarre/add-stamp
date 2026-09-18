import tailwindcss from "@tailwindcss/vite";

// The wasm artifact is published to /wasm/v<version>/, so the client needs the version to
// build its import URL. Read from package.json rather than duplicated here, which is also
// what scripts/build-wasm.mjs does when it writes the directory.
import { version } from "./package.json";

/**
 * Where the site actually lives. Canonical links, Open Graph URLs and the sitemap are all
 * absolute, and an absolute URL that points at the wrong host is worse than none at all —
 * so it is declared once, here, and overridable per deploy with NUXT_PUBLIC_SITE_URL.
 *
 * No trailing slash: everything below joins paths onto it.
 */
const siteUrl = process.env.NUXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://stamp.bizarre.how';

/**
 * Sets the theme class before first paint.
 *
 * The pages are prerendered as light-theme HTML — a build machine has no way to know what
 * the visitor prefers. Without this the app would flash the light palette on every load for
 * anyone on a dark OS, which is most of the audience.
 */
const themeBoot = `try{var t=localStorage.getItem('add-stamp:theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.classList.toggle('dark',t==='dark')}catch(e){}`;

export default defineNuxtConfig({
  /**
   * On, but only so the pages can be prerendered — see nitro.prerender below. Nothing is
   * rendered per request: the output is static HTML plus the same client bundle as before.
   *
   * This is what makes the site indexable. As a pure SPA the server returned an empty
   * shell, which Google will render eventually and every other crawler — Bing, and the
   * unfurlers behind Slack, X, LinkedIn and Facebook — will not.
   */
  ssr: true,

  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],

  app: {
    head: {
      htmlAttrs: { lang: 'en' },

      // Pages own their whole title via usePageSeo; this is only what a page without one
      // would get.
      title: 'Add Stamp — batch watermarking in the browser',

      meta: [
        { name: 'description', content: 'Put your mark on a whole folder of frames. Nothing leaves the browser.' },
        { name: 'author', content: 'howbizarre' },

        // Both palettes are declared so the browser chrome matches whichever theme is live.
        { name: 'theme-color', content: '#f2ebe0', media: '(prefers-color-scheme: light)' },
        { name: 'theme-color', content: '#15171a', media: '(prefers-color-scheme: dark)' },

        // Per-page og:title/description/url/image are set by usePageSeo. These are the
        // constants, which would otherwise be repeated on every page.
        { property: 'og:site_name', content: 'Add Stamp' },
        { property: 'og:locale', content: 'en_US' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:creator', content: '@howbizarre' }
      ],

      link: [
        // 48x48 is the largest entry in the .ico; naming it stops Chrome guessing.
        { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/site.webmanifest' },

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
      wasmVersion: version,
      siteUrl
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

    /**
     * Both pages and the sitemap are written out as files at build time.
     *
     * crawlLinks is off: the route list is two entries long and named right here, and a
     * crawler would also chase the outbound GitHub and X links in the footer.
     */
    prerender: {
      routes: ['/', '/how-to-use', '/sitemap.xml'],
      crawlLinks: false,
      failOnError: true
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
