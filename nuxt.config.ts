import tailwindcss from "@tailwindcss/vite";

// The wasm artifact is published to /wasm/v<version>/, so the client needs the version to
// build its import URL. Read from package.json rather than duplicated here, which is also
// what scripts/build-wasm.mjs does when it writes the directory.
import { version } from "./package.json";

export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],

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