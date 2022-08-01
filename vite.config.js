import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import sveltePreprocess from 'svelte-preprocess';

// https://vitejs.dev/config/
export default defineConfig({
  optimizeDeps: {
    entries: "./index.html",
  },
  plugins: [svelte({
    preprocess: [sveltePreprocess({ typescript: true, })],
  })]
})
