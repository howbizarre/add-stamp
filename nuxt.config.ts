import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],

  vite: {
    plugins: [tailwindcss()]
  },

  nitro: {
    preset: 'cloudflare_module',

    cloudflare: {
      deployConfig: true,
      nodeCompat: true
    },

    // Add proper headers for WASM files
    routeRules: {
      '/wasm/*.wasm': { 
        headers: { 
          'Content-Type': 'application/wasm'
        } 
      },
      '/wasm/*.js': { 
        headers: { 
          'Content-Type': 'application/javascript'
        } 
      }
    }
  },

  modules: ['nitro-cloudflare-dev']
});